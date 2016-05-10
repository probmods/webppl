'use strict';

var _ = require('underscore');
var assert = require('assert');
var Trace = require('../trace');
var ad = require('../ad');

module.exports = function(env) {

  // Returns a trace which has a non-zero probability.

  var warnAfter = [1e3, 1e4, 1e5, 1e6];

  function Initialize(cont, wpplFn, s, k, a, options) {
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    this.ad = options.ad;
    this.failures = 0;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  Initialize.prototype.run = function() {
    this.trace = new Trace(this.wpplFn, this.s, this.k, this.a);
    env.query.clear();
    return this.trace.continue();
  };

  Initialize.prototype.sample = function(s, k, a, dist) {
    var _val = dist.sample();
    var val = this.ad && dist.isContinuous ? ad.lift(_val) : _val;
    this.trace.addChoice(dist, val, a, s, k);
    return k(s, val);
  };

  Initialize.prototype.factor = function(s, k, a, score) {
    if (score === -Infinity) {
      return this.fail();
    }
    this.trace.score = ad.scalar.add(this.trace.score, score);
    return k(s);
  };

  Initialize.prototype.fail = function() {
    this.failures += 1;
    var ix = warnAfter.indexOf(this.failures);
    if (ix >= 0) {
      console.log(['Initialization warning [', (ix + 1), '/', warnAfter.length,
                   ']: Trace not initialized after ', this.failures, ' attempts.'].join(''));
    }
    return this.run();
  };

  Initialize.prototype.exit = function(s, val) {
    assert.notStrictEqual(this.trace.score, -Infinity);
    this.trace.complete(val);
    if (this.trace.value === env.query) {
      this.trace.value = env.query.getTable();
    }
    env.coroutine = this.coroutine;
    return this.cont(this.trace);
  };

  Initialize.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return function(cont, wpplFn, s, k, a, options) {
    return new Initialize(cont, wpplFn, s, k, a, options).run();
  };

};
