'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');

module.exports = function(env) {

  function makeTrace() {
    return [];
  }

  function findChoice(trace, name) {
    assert(trace !== undefined);
    for (var i = 0; i < trace.length; i++) {
      if (trace[i].name === name) {
        return trace[i];
      }
    }
    return undefined;
  }

  function acceptProb(trace, oldTrace, regenFrom, currScore, oldScore) {
    assert(trace !== undefined);
    assert(oldTrace !== undefined);
    assert(_.isNumber(currScore));
    assert(_.isNumber(oldScore));
    assert(_.isNumber(regenFrom));

    var fw = -Math.log(oldTrace.length);
    trace.slice(regenFrom).map(function(s) {
      fw += s.reused ? 0 : s.choiceScore;
    });
    var bw = -Math.log(trace.length);
    oldTrace.slice(regenFrom).map(function(s) {
      var nc = findChoice(trace, s.name);
      bw += (!nc || !nc.reused) ? s.choiceScore : 0;
    });
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  // Takes a wpplFn and a trace, and generates a new trace.

  function MHKernel(s, k, a, wpplFn, oldTrace, exitAddress) {

    this.wpplFn = wpplFn;
    this.k = k;
    this.s = s;
    this.a = a;

    this.oldTrace = oldTrace;
    this.exitAddress = exitAddress;

    // These are set properly in run.
    this.trace = makeTrace();
    this.score = 0;
    this.regenFrom = 0;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    // Make a new proposal.
    this.regenFrom = Math.floor(Math.random() * this.oldTrace.length);
    var regen = this.oldTrace[this.regenFrom];
    this.trace = this.oldTrace.slice(0, this.regenFrom);
    this.score = regen.score;
    return this.sample(_.clone(regen.s), regen.k, regen.name, regen.erp, regen.params, true);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    this.score += score;
    if (this.exitAddress === a) {
      this.trace.k = k;
      return env.exit(s);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var prev = findChoice(this.oldTrace, name);
    var reuse = !(prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    var choiceScore = erp.score(params, val);

    this.trace.push({
      k: cont,
      name: name,
      erp: erp,
      params: params,
      score: this.score,
      choiceScore: choiceScore,
      val: val,
      s: _.clone(s),
      reused: reuse // TODO: MH specific. OK, or store elsewhere?
    });

    this.score += choiceScore;
    return cont(s, val);
  };

  MHKernel.prototype.exit = function(s, val) {

    if (this.exitAddress !== undefined) assert(this.trace.k !== undefined);
    this.trace.val = val;
    this.trace.score = this.score;

    // TODO: The score is part of the trace so there's no need to pass them separately here.
    var acceptance = acceptProb(this.trace, this.oldTrace, this.regenFrom, this.score, this.oldTrace.score);
    var returnTrace = Math.random() < acceptance ? this.trace : this.oldTrace
    env.coroutine = this.coroutine;
    return this.k(this.s, returnTrace);
  };

  return {
    MHKernel: function(s, k, a, wpplFn, oldTrace, exitAddress) {
      return new MHKernel(s, k, a, wpplFn, oldTrace, exitAddress).run();
    }
  };

};
