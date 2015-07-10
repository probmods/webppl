'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var Trace = require('../trace.js').Trace;

module.exports = function(env) {

  // This takes a wpplFn and returns a trace which has a non-zero probability.

  // It might plausibly be fleshed out into a full rejection sampler.

  function Rejection(s, k, a, wpplFn) {
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  Rejection.prototype.run = function() {
    this.trace = new Trace();
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  Rejection.prototype.sample = function(s, k, a, erp, params) {
    var val = erp.sample(params);
    this.trace.addChoice(erp, params, val, a, s, k);
    return k(s, val);
  };

  Rejection.prototype.factor = function(s, k, a, score) {
    this.trace.score += score;
    return k(s);
  };

  Rejection.prototype.exit = function(s, val) {
    if (this.trace.score === -Infinity) {
      console.log('Reject!');
      return this.run();
    }
    this.trace.complete(val);
    env.coroutine = this.coroutine;
    return this.k(this.s, this.trace);
  };

  return {
    Rejection: function(s, k, a, wpplFn) {
      return new Rejection(s, k, a, wpplFn).run();
    }
  };
};
