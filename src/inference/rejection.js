'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');

module.exports = function(env) {

  function makeTrace() {
    return [];
  };

  // This takes a wpplFn and returns a trace which has a non-zero probability.

  // It might plausibly be fleshed out into a full rejection sampler.

  function Rejection(s, k, a, wpplFn) {
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;
    this.score = 0;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  Rejection.prototype.run = function() {
    this.trace = makeTrace();
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  Rejection.prototype.sample = function(s, k, a, erp, params) {
    var val = erp.sample(params);
    var choiceScore = erp.score(params, val);
    this.trace.push({
      k: k,
      name: a,
      erp: erp,
      params: params,
      score: this.score,
      choiceScore: choiceScore,
      val: val,
      s: _.clone(s)
    });
    this.score += choiceScore;
    return k(s, val);
  };

  Rejection.prototype.factor = function(s, k, a, score) {
    this.score += score;
    return k(s);
  };

  Rejection.prototype.exit = function(s, val) {
    if (this.score === -Infinity) {
      console.log('Reject!');
      this.score = 0;
      return this.run();
    }
    this.trace.val = val;
    this.trace.score = this.score;
    env.coroutine = this.coroutine;
    return this.k(this.s, this.trace);
  };

  return {
    Rejection: function(s, k, a, wpplFn) {
      return new Rejection(s, k, a, wpplFn).run();
    }
  };
};
