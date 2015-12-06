'use strict';

var _ = require('underscore');
var assert = require('assert');
var Trace = require('../trace');

module.exports = function(env) {

  // This takes a wpplFn and returns a trace which has a non-zero probability.

  var warnAfter = [1e3, 1e4, 1e5, 1e6];

  function Initialize(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
        observeMode: 'none', // Modes - none, use, build 
        observeTable: undefined
      });

    if (options.observeMode === 'use')
      assert (options.observeTable !== undefined);
    else if (options.observeMode === 'build')
      options.observeTable = {}

    this.wpplFn = wpplFn;
    this.observeMode = options.observeMode;
    this.observeTable = options.observeTable;
    this.s = s;
    this.k = k;
    this.a = a;
    this.failures = 0;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  Initialize.prototype.run = function() {
    this.trace = new Trace();
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
      return this.fail();
    }
    this.trace.score += score;
    return k(s);
  };

  Initialize.prototype.observe = function(s, k, a, erp, params, val) {

    if (this.observeMode === 'none') {
      assert (val !== undefined);
      var score = erp.score(params, val);
      return this.factor(s, k, a, score);
    } else if (this.observeMode === 'build') {
      var val = erp.sample(params);
      var score = erp.score(params, val);
      this.observeTable[a] = val;
      return this.factor(s, k, a, score);
    }
    else if (this.observeMode === 'use') {
      var val = this.observeTable[a];
      var score = (val === undefined) ? -Infinity : erp.score(params, val);
      return this.factor(s, k, a, score);
    } else throw new Error ('Invalid observe mode. Shoule be one of - use/build/none');
  }

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
    env.coroutine = this.coroutine;
    if (this.observeMode === 'build')
      return this.k(this.s, [this.trace, this.observeTable]);
    else return this.k(this.s, this.trace);
  };

  Initialize.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return {
    Initialize: function(s, k, a, wpplFn) {
      return new Initialize(s, k, a, wpplFn).run();
    }
  };
};
