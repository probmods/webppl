'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var Trace = require('../trace');

module.exports = function(env) {

  // This takes a wpplFn and returns a trace which has a non-zero probability.

  function Initialize(s, k, a, wpplFn) {
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  Initialize.prototype.run = function() {
    this.trace = new Trace();
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  Initialize.prototype.sample = function(s, k, a, erp, params) {
    var val = erp.sample(params);
    this.trace.addChoice(erp, params, val, a, s, k);
    return k(s, val);
  };

  Initialize.prototype.factor = function(s, k, a, score) {
    this.trace.score += score;
    return k(s);
  };

  Initialize.prototype.exit = function(s, val) {
    if (this.trace.score === -Infinity) {
      //console.log('Reject!');
      return this.run();
    }
    this.trace.complete(val);
    env.coroutine = this.coroutine;
    return this.k(this.s, this.trace);
  };

  return {
    Initialize: function(s, k, a, wpplFn) {
      return new Initialize(s, k, a, wpplFn).run();
    }
  };
};
