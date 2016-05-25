'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var ad = require('../ad');

module.exports = function(env) {

  function MHKernel(cont, oldTrace, options) {
    var options = util.mergeDefaults(options, {
      proposalBoundary: 0,
      exitFactor: 0,
      permissive: false,
      discreteOnly: false,
      adRequired: false
    });

    if (!options.permissive) {
      assert.notStrictEqual(oldTrace.score, -Infinity);
    }

    this.cont = cont;
    this.oldTrace = oldTrace;
    this.reused = {};

    this.proposalBoundary = options.proposalBoundary;
    this.exitFactor = options.exitFactor;
    this.discreteOnly = options.discreteOnly;
    this.adRequired = options.adRequired;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    this.regenFrom = this.sampleRegenChoice(this.oldTrace);
    if (this.regenFrom < 0) {
      return this.finish(this.oldTrace, true);
    }
    env.query.clear();
    this.trace = this.oldTrace.upto(this.regenFrom);
    var regen = this.oldTrace.choiceAtIndex(this.regenFrom);
    return this.sample(_.clone(regen.store), regen.k, regen.address, regen.dist, true);
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

  MHKernel.prototype.sample = function(s, k, a, dist, forceSample) {
    var _val, val;
    var prevChoice = this.oldTrace.findChoice(a);

    if (forceSample) {
      assert(prevChoice);
      var proposalDist = dist.driftKernel ? dist.driftKernel(prevChoice.val) : dist;
      _val = proposalDist.sample();
      val = this.adRequired && proposalDist.isContinuous ? ad.lift(_val) : _val;
      // Optimization: Bail early if same value is re-sampled.
      if (!proposalDist.isContinuous && prevChoice.val === val) {
        return this.finish(this.oldTrace, true);
      }
    } else {
      if (prevChoice) {
        val = prevChoice.val; // Will be a tape if continuous.
        this.reused[a] = true;
      } else {
        _val = dist.sample();
        val = this.adRequired && dist.isContinuous ? ad.lift(_val) : _val;
      }
    }

    this.trace.addChoice(dist, val, a, s, k);
    if (ad.value(this.trace.score) === -Infinity) {
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
      trace.value = _.extendOwn({}, this.oldTrace.value, env.query.getTable());
    }
    if (this.oldTrace.info) {
      var oldInfo = this.oldTrace.info;
      trace.info = {
        accepted: oldInfo.accepted + accepted,
        total: oldInfo.total + 1
      };
    }
    env.coroutine = this.coroutine;
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
    // assert(_.isNumber(ad.value(trace.score)));
    // assert(_.isNumber(ad.value(oldTrace.score)));
    // assert(_.isNumber(this.regenFrom));
    // assert(_.isNumber(this.proposalBoundary));

    var fw = this.transitionProb(oldTrace, trace);
    var bw = this.transitionProb(trace, oldTrace);
    var p = Math.exp(ad.value(trace.score) - ad.value(oldTrace.score) + bw - fw);
    assert(!isNaN(p));
    return Math.min(1, p);
  };

  MHKernel.prototype.transitionProb = function(fromTrace, toTrace) {
    // Proposed to distribution.
    var proposalDist;
    var regenChoice = toTrace.choiceAtIndex(this.regenFrom);

    if (regenChoice.dist.driftKernel) {
      proposalDist = regenChoice.dist.driftKernel(fromTrace.choiceAtIndex(this.regenFrom).val);
    } else {
      proposalDist = regenChoice.dist;
    }

    var score = ad.value(proposalDist.score(regenChoice.val));

    // Rest of the trace.
    score += util.sum(toTrace.choices.slice(this.regenFrom + 1).map(function(choice) {
      return this.reused.hasOwnProperty(choice.address) ? 0 : ad.value(choice.dist.score(choice.val));
    }, this));

    score -= Math.log(this.numRegenChoices(fromTrace));
    assert(!isNaN(score));
    return score;
  };

  return function(cont, runWppl, oldTrace, options) {
    return new MHKernel(cont, runWppl, oldTrace, options).run();
  };

};
