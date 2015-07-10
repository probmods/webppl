'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
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
      // TODO: Don't we need to save the store as well as the continuation. (Does smc.js do this?)
      // TODO: Set via trace.saveContinuation()
      this.trace.k = k;
      return env.exit(s);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var prev = this.oldTrace.findChoice(name);
    var reuse = !(prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    this.trace.addChoice(erp, params, val, name, s, cont, reuse);
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

    var fw = -Math.log(oldTrace.length);
    trace.upto(regenFrom).map(function(s) {
      fw += s.reused ? 0 : s.choiceScore;
    });
    var bw = -Math.log(trace.length);
    oldTrace.upto(regenFrom).map(function(s) {
      var nc = trace.findChoice(s.name);
      bw += (!nc || !nc.reused) ? s.choiceScore : 0;
    });
    var p = Math.exp(trace.score - oldTrace.score + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  return {
    MHKernel: function(s, k, a, wpplFn, oldTrace, exitAddress) {
      return new MHKernel(s, k, a, wpplFn, oldTrace, exitAddress).run();
    }
  };

};
