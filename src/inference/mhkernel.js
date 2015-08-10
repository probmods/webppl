'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var util = require('../util');
var Trace = require('../trace.js').Trace;

module.exports = function(env) {

  // Takes a wpplFn and a trace, and generates a new trace.

  function MHKernel(s, k, a, wpplFn, oldTrace, exitAddress) {

    this.wpplFn = wpplFn;
    this.k = k;
    this.s = s;
    this.a = a;

    this.oldTrace = oldTrace;
    this.exitAddress = exitAddress;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    // Make a new proposal.
    this.regenFrom = Math.floor(Math.random() * this.oldTrace.length);
    this.trace = this.oldTrace.upto(this.regenFrom);
    var regen = this.oldTrace.choiceAtIndex(this.regenFrom);
    return this.sample(_.clone(regen.s), regen.k, regen.name, regen.erp, regen.params, true);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    this.trace.score += score;
    if (this.exitAddress === a) {
      this.trace.saveContinuation(k, s);
      return env.exit(s);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var val, prevChoice = this.oldTrace.findChoice(name);

    if (forceSample) {
      assert(prevChoice);
      var proposalErp = erp.proposer || erp;
      var proposalParams = erp.proposer ? [params, prevChoice.val] : params;
      val = proposalErp.sample(proposalParams);
    } else {
      if (prevChoice) {
        val = prevChoice.val;
      } else {
        val = erp.sample(params);
      }
    }

    this.trace.addChoice(erp, params, val, name, s, cont);
    return cont(s, val);
  };

  MHKernel.prototype.exit = function(s, val) {
    if (this.exitAddress !== undefined) assert(this.trace.k !== undefined);
    this.trace.complete(val);
    var acceptance = acceptProb(this.trace, this.oldTrace, this.regenFrom);
    var returnTrace = Math.random() < acceptance ? this.trace : this.oldTrace
    env.coroutine = this.coroutine;
    return this.k(this.s, returnTrace);
  };

  function acceptProb(trace, oldTrace, regenFrom) {
    assert(trace !== undefined);
    assert(oldTrace !== undefined);
    assert(_.isNumber(trace.score));
    assert(_.isNumber(oldTrace.score));
    assert(_.isNumber(regenFrom));

    var p = Math.exp(trace.score - oldTrace.score + q(trace, oldTrace, regenFrom) - q(oldTrace, trace, regenFrom));
    assert(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  function q(fromTrace, toTrace, r) {
    // TODO: Add the optimization (?) which skips over choices that were reused.

    // Possible drift proposal at regen ERP.
    var proposalErp, proposalParams;
    var regenChoice = toTrace.choices[r];

    if (regenChoice.erp.proposer) {
      proposalErp = regenChoice.erp.proposer;
      proposalParams = [regenChoice.params, fromTrace.findChoice(regenChoice.name).val];
    } else {
      proposalErp = regenChoice.erp;
      proposalParams = regenChoice.params;
    }

    var score = proposalErp.score(proposalParams, regenChoice.val);

    // Rest of the trace.
    score += util.sum(toTrace.choices.slice(r + 1).map(function(choice) {
      return choice.erp.score(choice.params, choice.val);
    }));

    score -= Math.log(fromTrace.length);
    assert(!isNaN(score));
    assert(score <= 0);

    return score;
  }

  return {
    MHKernel: function(s, k, a, wpplFn, oldTrace, exitAddress) {
      return new MHKernel(s, k, a, wpplFn, oldTrace, exitAddress).run();
    }
  };

};
