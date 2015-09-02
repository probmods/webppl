'use strict';

var _ = require('underscore');
var assert = require('assert');
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
    // TODO: Consider having MCMC be responsible for re-running init. when score
    // is -Inf. That way it can take care of resetting env.query rather than
    // doing it in every init method and kernel.
    env.query.clear();
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  Initialize.prototype.sample = function(s, k, a, erp, params) {
    var val = erp.sample(params);
    this.trace.addChoice(erp, params, val, a, s, k);
    return k(s, val);
  };

  Initialize.prototype.factor = function(s, k, a, score) {
    if (score === -Infinity) {
      return this.run();
    }
    this.trace.score += score;
    return k(s);
  };

  Initialize.prototype.exit = function(s, val) {
    assert(this.trace.score !== -Infinity);
    this.trace.complete(val);
    env.coroutine = this.coroutine;
    return this.k(this.s, this.trace);
  };

  Initialize.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return {
    Initialize: function(s, k, a, wpplFn) {
      return new Initialize(s, k, a, wpplFn).run();
    }
  };
};
