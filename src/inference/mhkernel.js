'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp');
var util = require('../util');

module.exports = function(env) {

  function MHKernel(k, oldTrace, options) {
    var options = util.mergeDefaults(options, {
      proposalBoundary: 0,
      permissive: false
    });

    if (!options.permissive) {
      assert.notStrictEqual(oldTrace.score, -Infinity);
    }

    this.k = k;
    this.oldTrace = oldTrace;
    this.reused = {};
    this.exitAddress = options.exitAddress;
    this.proposalBoundary = options.proposalBoundary;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    var numERP = this.oldTrace.length - this.proposalBoundary;
    if (numERP === 0) {
      return this.cont(this.oldTrace, true);
    }
    // Make a new proposal.
    env.query.clear();
    this.regenFrom = this.proposalBoundary + Math.floor(util.random() * numERP);
    this.trace = this.oldTrace.upto(this.regenFrom);
    var regen = this.oldTrace.choiceAtIndex(this.regenFrom);
    return this.sample(_.clone(regen.store), regen.k, regen.address, regen.erp, regen.params, true);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    // Optimization: Bail early if we know acceptProb will be zero.
    if (score === -Infinity) {
      return this.cont(this.oldTrace, false);
    }
    this.trace.score += score;
    if (this.exitAddress === a) {
      this.trace.saveContinuation(s, k, a);
      return env.exit(s);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, k, a, erp, params, forceSample) {
    var val, prevChoice = this.oldTrace.findChoice(a);

    if (forceSample) {
      assert(prevChoice);
      var proposalErp = erp.proposer || erp;
      var proposalParams = erp.proposer ? [params, prevChoice.val] : params;
      val = proposalErp.sample(proposalParams);
      // Optimization: Bail early if same value is re-sampled.
      if (prevChoice.val === val) {
        return this.cont(this.oldTrace, true);
      }
    } else {
      if (prevChoice) {
        val = prevChoice.val;
        this.reused[a] = true;
      } else {
        val = erp.sample(params);
      }
    }

    this.trace.addChoice(erp, params, val, a, s, k);
    if (this.trace.score === -Infinity) {
      return this.cont(this.oldTrace, false);
    }
    return k(s, val);
  };

  MHKernel.prototype.exit = function(s, val) {
    if (!this.exitAddress) {
      this.trace.complete(val);
    } else {
      // We're rejuvenating a particle - ensure that exitAddress was reached by
      // checking that the continuation was saved.
      assert(!this.trace.isComplete(), 'Particle missed exit address during rejuvenation.');
    }
    var prob = acceptProb(this.trace, this.oldTrace, this.regenFrom, this.reused, this.proposalBoundary);
    var accept = util.random() < prob;
    return this.cont(accept ? this.trace : this.oldTrace, accept);
  };

  MHKernel.prototype.cont = function(trace, accepted) {
    assert(_.isBoolean(accepted));
    env.coroutine = this.coroutine;
    trace.info = { accepted: accepted };
    return this.k(trace);
  };

  MHKernel.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function acceptProb(trace, oldTrace, regenFrom, reused, proposalBoundary) {
    // assert.notStrictEqual(trace, undefined);
    // assert.notStrictEqual(oldTrace, undefined);
    // assert(_.isNumber(trace.score));
    // assert(_.isNumber(oldTrace.score));
    // assert(_.isNumber(regenFrom));
    // assert(_.isNumber(proposalBoundary));

    var fw = transitionProb(oldTrace, trace, regenFrom, reused, proposalBoundary);
    var bw = transitionProb(trace, oldTrace, regenFrom, reused, proposalBoundary);
    var p = Math.exp(trace.score - oldTrace.score + bw - fw);
    assert(!isNaN(p));
    return Math.min(1, p);
  }

  function transitionProb(fromTrace, toTrace, regenFrom, reused, proposalBoundary) {
    // Proposed to ERP.
    var proposalErp, proposalParams;
    var regenChoice = toTrace.choiceAtIndex(regenFrom);

    if (regenChoice.erp.proposer) {
      proposalErp = regenChoice.erp.proposer;
      proposalParams = [regenChoice.params, fromTrace.choiceAtIndex(regenFrom).val];
    } else {
      proposalErp = regenChoice.erp;
      proposalParams = regenChoice.params;
    }

    var score = proposalErp.score(proposalParams, regenChoice.val);

    // Rest of the trace.
    score += util.sum(toTrace.choices.slice(regenFrom + 1).map(function(choice) {
      return reused.hasOwnProperty(choice.address) ? 0 : choice.erp.score(choice.params, choice.val);
    }));

    score -= Math.log(fromTrace.length - proposalBoundary);
    assert(!isNaN(score));
    return score;
  }

  return {
    MHKernel: function(k, oldTrace, options) {
      return new MHKernel(k, oldTrace, options).run();
    }
  };

};
