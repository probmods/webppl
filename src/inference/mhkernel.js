'use strict';

var _ = require('lodash');
var assert = require('assert');
var util = require('../util');
var numeric = require('../math/numeric');
var ad = require('../ad');

module.exports = function(env) {

  var drift = require('./driftKernel')(env);

  function makeMHKernel(options) {
    options = util.mergeDefaults(options, {
      adRequired: false,
      permissive: false,
      discreteOnly: false
    }, 'MH kernel');
    return function(cont, oldTrace, runOpts) {
      return new MHKernel(cont, oldTrace, options, runOpts).run();
    };
  }

  function MHKernel(cont, oldTrace, options, runOpts) {
    this.discreteOnly = options.discreteOnly;
    this.adRequired = options.adRequired;
    if (!options.permissive) {
      assert.notStrictEqual(oldTrace.score, -Infinity);
    }

    runOpts = util.mergeDefaults(runOpts, {
      proposalBoundary: 0,
      exitFactor: 0
    });

    this.proposalBoundary = runOpts.proposalBoundary;
    this.exitFactor = runOpts.exitFactor;

    this.cont = cont;
    this.oldTrace = oldTrace;
    this.a = oldTrace.baseAddress; // Support relative addressing.
    this.reused = {};

    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    this.regenFrom = this.sampleRegenChoice(this.oldTrace);
    if (this.regenFrom < 0) {
      // Immediately return from coroutine if there are no random
      // choices to propose to.
      return this.continue(this.oldTrace);
    }
    env.query.clear();
    this.trace = this.oldTrace.upto(this.regenFrom);
    var regen = this.oldTrace.choiceAtIndex(this.regenFrom);
    return this.resample(_.clone(regen.store), regen.k, regen.address, regen.dist, regen.options);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    // Optimization: Bail early if we know acceptProb will be zero.
    if (ad.value(score) === -Infinity) {
      return this.finish(this.oldTrace, false);
    }
    this.trace.numFactors += 1;
    this.trace.score = ad.scalar.add(this.trace.score, score);
    if (this.trace.numFactors === this.exitFactor) {
      this.trace.saveContinuation(s, k);
      return this.exit(s, undefined, true);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, k, a, dist, options) {
    var prevChoice = this.oldTrace.findChoice(a);

    var val;
    if (prevChoice) {
      val = prevChoice.val; // Will be a tape if continuous.
      this.reused[a] = true;
    } else {
      var _val = dist.sample();
      val = this.adRequired && dist.isContinuous ? ad.lift(_val) : _val;
    }

    return this.addChoiceToTrace(s, k, a, dist, options, val);
  };

  // Generation of a new proposal begins here, by re-sampling a value
  // for the random choice selected as the regen point.
  MHKernel.prototype.resample = function(s, k, a, dist, options) {
    var prevChoice = this.oldTrace.findChoice(a);
    assert(prevChoice);

    return drift.getProposalDist(s, a, dist, options, prevChoice.val, function(s, fwdProposalDist) {

      var _val = fwdProposalDist.sample();
      var val = this.adRequired && fwdProposalDist.isContinuous ? ad.lift(_val) : _val;

      // Optimization: Bail early if same value is re-sampled.
      if (!fwdProposalDist.isContinuous && prevChoice.val === val) {
        return this.finish(this.oldTrace, true);
      }

      return drift.getProposalDist(s, a, dist, options, val, function(s, revProposalDist) {

        // Store references to the proposal distributions. Getting our
        // hands on them again later (from the non-CPS acceptance
        // probability code) would be tricky.
        this.fwdProposalDist = fwdProposalDist;
        this.revProposalDist = revProposalDist;

        return this.addChoiceToTrace(s, k, a, dist, options, val, true);

      }.bind(this));

    }.bind(this));
  };

  MHKernel.prototype.addChoiceToTrace = function(s, k, a, dist, options, val, atResample) {
    this.trace.addChoice(dist, val, a, s, k, options);
    if (ad.value(this.trace.score) === -Infinity) {
      if (atResample && _.has(options, 'driftKernel')) {
        drift.proposalWarning(dist);
      }
      return this.finish(this.oldTrace, false);
    }
    return k(s, val);
  };

  MHKernel.prototype.exit = function(s, val, earlyExit) {
    if (!earlyExit) {
      this.trace.complete(val);
    } else {
      assert(this.trace.store);
      assert(this.trace.k);
      assert(!this.trace.isComplete());
    }
    var prob = this.acceptProb(this.trace, this.oldTrace);
    var accept = util.random() < prob;
    return this.finish(accept ? this.trace : this.oldTrace, accept);
  };

  MHKernel.prototype.finish = function(trace, accepted) {
    assert(_.isBoolean(accepted));
    if (accepted && trace.value === env.query) {
      trace.value = _.assign({}, this.oldTrace.value, env.query.getTable());
    }
    if (this.oldTrace.info) {
      var oldInfo = this.oldTrace.info;
      trace.info = {
        accepted: oldInfo.accepted + accepted,
        total: oldInfo.total + 1
      };
    }
    return this.continue(trace);
  };

  MHKernel.prototype.continue = function(trace) {
    env.coroutine = this.oldCoroutine;
    return this.cont(trace);
  };

  MHKernel.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  MHKernel.prototype.proposableDiscreteDistIndices = function(trace) {
    return _.range(this.proposalBoundary, trace.length).filter(function(i) {
      return !trace.choices[i].dist.isContinuous;
    });
  };

  MHKernel.prototype.numRegenChoices = function(trace) {
    if (this.discreteOnly) {
      return this.proposableDiscreteDistIndices(trace).length;
    } else {
      return trace.length - this.proposalBoundary;
    }
  };

  MHKernel.prototype.sampleRegenChoice = function(trace) {
    return this.discreteOnly ?
        this.sampleRegenChoiceDiscrete(trace) :
        this.sampleRegenChoiceAny(trace);
  };

  MHKernel.prototype.sampleRegenChoiceDiscrete = function(trace) {
    var indices = this.proposableDiscreteDistIndices(trace);
    return indices.length > 0 ? indices[Math.floor(util.random() * indices.length)] : -1;
  };

  MHKernel.prototype.sampleRegenChoiceAny = function(trace) {
    var numChoices = trace.length - this.proposalBoundary;
    return numChoices > 0 ? this.proposalBoundary + Math.floor(util.random() * numChoices) : -1;
  };

  MHKernel.prototype.acceptProb = function(trace, oldTrace) {
    // assert.notStrictEqual(trace, undefined);
    // assert.notStrictEqual(oldTrace, undefined);
    // assert.notStrictEqual(this.fwdProposalDist, undefined);
    // assert.notStrictEqual(this.revProposalDist, undefined);
    // assert(_.isNumber(ad.value(trace.score)));
    // assert(_.isNumber(ad.value(oldTrace.score)));
    // assert(_.isNumber(this.regenFrom));
    // assert(_.isNumber(this.proposalBoundary));

    var fw = this.transitionProb(oldTrace, trace, this.fwdProposalDist);
    var bw = this.transitionProb(trace, oldTrace, this.revProposalDist);
    var p = Math.exp(ad.value(trace.score) - ad.value(oldTrace.score) + bw - fw);
    assert(!isNaN(p));
    return Math.min(1, p);
  };

  MHKernel.prototype.transitionProb = function(fromTrace, toTrace, proposalDist) {
    var regenChoice = toTrace.choiceAtIndex(this.regenFrom);
    var score = ad.value(proposalDist.score(regenChoice.val));

    // Rest of the trace.
    score += numeric._sum(toTrace.choices.slice(this.regenFrom + 1).map(function(choice) {
      return this.reused.hasOwnProperty(choice.address) ? 0 : ad.value(choice.dist.score(choice.val));
    }, this));

    score -= Math.log(this.numRegenChoices(fromTrace));
    assert(!isNaN(score));
    return score;
  };

  return makeMHKernel;

};
