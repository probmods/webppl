'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var util = require('../util');
var Trace = require('../trace');

module.exports = function(env) {

  function MHKernel(k, oldTrace, exitAddress) {
    this.k = k;
    this.oldTrace = oldTrace;
    this.reused = {};
    this.exitAddress = exitAddress;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    if (this.oldTrace.length === 0) { return this.cont(this.oldTrace); }
    // Make a new proposal.
    this.regenFrom = Math.floor(Math.random() * this.oldTrace.length);
    this.trace = this.oldTrace.upto(this.regenFrom);
    var regen = this.oldTrace.choiceAtIndex(this.regenFrom);
    return this.sample(_.clone(regen.store), regen.k, regen.address, regen.erp, regen.params, true);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    // Optimization: Bail early if we know acceptProb will be zero.
    if (score === -Infinity) { return this.cont(this.oldTrace); }
    this.trace.score += score;
    if (this.exitAddress === a) {
      this.trace.saveContinuation(k, s);
      return env.exit(s);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, cont, address, erp, params, forceSample) {
    var val, prevChoice = this.oldTrace.findChoice(address);

    if (forceSample) {
      assert(prevChoice);
      var proposalErp = erp.proposer || erp;
      var proposalParams = erp.proposer ? [params, prevChoice.val] : params;
      val = proposalErp.sample(proposalParams);
      // Optimization: Bail early if same value is re-sampled.
      if (prevChoice.val === val) { return this.cont(this.oldTrace); }
    } else {
      if (prevChoice) {
        val = prevChoice.val;
        this.reused[address] = true;
      } else {
        val = erp.sample(params);
      }
    }

    this.trace.addChoice(erp, params, val, address, s, cont);
    return cont(s, val);
  };

  MHKernel.prototype.exit = function(s, val) {
    if (!this.exitAddress) {
      this.trace.complete(val);
    } else {
      // We're rejuvenating a particle - ensure that exitAddress was reached by
      // checking that the continuation was saved.
      assert(this.trace.k && this.trace.store);
    }
    var acceptance = acceptProb(this.trace, this.oldTrace, this.regenFrom, this.reused);
    return this.cont(Math.random() < acceptance ? this.trace : this.oldTrace);
  };

  // TODO: Better name? (Used to bail from sample.)
  MHKernel.prototype.cont = function(val) {
    env.coroutine = this.coroutine;
    return this.k(val);
  };

  function acceptProb(trace, oldTrace, regenFrom, reused) {
    assert(trace !== undefined);
    assert(oldTrace !== undefined);
    assert(_.isNumber(trace.score));
    assert(_.isNumber(oldTrace.score));
    assert(_.isNumber(regenFrom));

    var fw = transitionProb(oldTrace, trace, regenFrom, reused);
    var bw = transitionProb(trace, oldTrace, regenFrom, reused);
    var p = Math.exp(trace.score - oldTrace.score + bw - fw);
    assert(!isNaN(p));
    return Math.min(1, p);
  }

  function transitionProb(fromTrace, toTrace, regenFrom, reused) {
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

    score -= Math.log(fromTrace.length);
    assert(!isNaN(score));
    return score;
  }

  return {
    MHKernel: function(k, oldTrace, exitAddress) {
      return new MHKernel(k, oldTrace, exitAddress).run();
    }
  };

};
