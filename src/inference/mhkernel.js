'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp');
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
    return this.sample(_.clone(regen.store), regen.k, regen.address, regen.erp, regen.params, true);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    // Optimization: Bail early if we know acceptProb will be zero.
    if (ad.untapify(score) === -Infinity) {
      return this.finish(this.oldTrace, false);
    }
    this.trace.numFactors += 1;
    this.trace.score = ad.add(this.trace.score, score);
    if (this.trace.numFactors === this.exitFactor) {
      this.trace.saveContinuation(s, k);
      return this.exit(s, undefined, true);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, k, a, erp, params, forceSample) {
    var _val, val;
    var prevChoice = this.oldTrace.findChoice(a);

    if (forceSample) {
      assert(prevChoice);
      var proposalErp = erp.proposer || erp;
      var proposalParams = erp.proposer ? [params, prevChoice.val] : params;
      _val = proposalErp.sample(ad.untapify(proposalParams));
      val = this.adRequired && proposalErp.isContinuous ? ad.tapify(_val) : _val;
      // Optimization: Bail early if same value is re-sampled.
      if (!proposalErp.isContinuous && prevChoice.val === val) {
        return this.finish(this.oldTrace, true);
      }
    } else {
      if (prevChoice) {
        val = prevChoice.val; // Will be a tape if continuous.
        this.reused[a] = true;
      } else {
        _val = erp.sample(ad.untapify(params));
        val = this.adRequired && erp.isContinuous ? ad.tapify(_val) : _val;
      }
    }

    this.trace.addChoice(erp, params, val, a, s, k);
    if (ad.untapify(this.trace.score) === -Infinity) {
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

  MHKernel.prototype.proposableDiscreteErpIndices = function(trace) {
    return _.range(this.proposalBoundary, trace.length).filter(function(i) {
      return !trace.choices[i].erp.isContinuous;
    });
  };

  MHKernel.prototype.numRegenChoices = function(trace) {
    if (this.discreteOnly) {
      return this.proposableDiscreteErpIndices(trace).length;
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
    var indices = this.proposableDiscreteErpIndices(trace);
    return indices.length > 0 ? indices[Math.floor(util.random() * indices.length)] : -1;
  };

  MHKernel.prototype.sampleRegenChoiceAny = function(trace) {
    var numChoices = trace.length - this.proposalBoundary;
    return numChoices > 0 ? this.proposalBoundary + Math.floor(util.random() * numChoices) : -1;
  };

  MHKernel.prototype.acceptProb = function(trace, oldTrace) {
    // assert.notStrictEqual(trace, undefined);
    // assert.notStrictEqual(oldTrace, undefined);
    // assert(_.isNumber(ad.untapify(trace.score)));
    // assert(_.isNumber(ad.untapify(oldTrace.score)));
    // assert(_.isNumber(this.regenFrom));
    // assert(_.isNumber(this.proposalBoundary));

    var fw = this.transitionProb(oldTrace, trace);
    var bw = this.transitionProb(trace, oldTrace);
    var p = Math.exp(ad.untapify(trace.score) - ad.untapify(oldTrace.score) + bw - fw);
    assert(!isNaN(p));
    return Math.min(1, p);
  };

  MHKernel.prototype.transitionProb = function(fromTrace, toTrace) {
    // Proposed to ERP.
    var proposalErp, proposalParams;
    var regenChoice = toTrace.choiceAtIndex(this.regenFrom);

    if (regenChoice.erp.proposer) {
      proposalErp = regenChoice.erp.proposer;
      proposalParams = [regenChoice.params, fromTrace.choiceAtIndex(this.regenFrom).val];
    } else {
      proposalErp = regenChoice.erp;
      proposalParams = regenChoice.params;
    }

    var score = ad.untapify(proposalErp.score(proposalParams, regenChoice.val));

    // Rest of the trace.
    score += util.sum(toTrace.choices.slice(this.regenFrom + 1).map(function(choice) {
      return this.reused.hasOwnProperty(choice.address) ? 0 : ad.untapify(choice.erp.score(choice.params, choice.val));
    }, this));

    score -= Math.log(this.numRegenChoices(fromTrace));
    assert(!isNaN(score));
    return score;
  };

  return function(cont, runWppl, oldTrace, options) {
    return new MHKernel(cont, runWppl, oldTrace, options).run();
  };

};
