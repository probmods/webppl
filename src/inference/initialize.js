'use strict';

var _ = require('underscore');
var assert = require('assert');
var Trace = require('../trace');

module.exports = function(env) {

  // This takes a wpplFn and returns a trace which has a non-zero probability.

  var warnAfter = [1e3, 1e4, 1e5, 1e6];

  function Initialize(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
        initSampleMode: 'none', // Modes - none, use, build 
        initObserveMode: 'none', // Modes - none, use, build 
        cacheTable: undefined
      });

    if (options.initSampleMode === 'use' || options.initObserveMode === 'use')
      assert (options.cacheTable !== undefined)
    
    if (options.initSampleMode === 'build' || options.initObserveMode === 'build')
      if (options.cacheTable === undefined)
        options.cacheTable = {}

    this.wpplFn = wpplFn;
    this.initSampleMode = options.initSampleMode
    this.initObserveMode = options.initObserveMode;
    this.cacheTable = options.cacheTable;
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
    var val;
    if (this.initSampleMode === 'none') {
      val = erp.sample(params);
    } else if (this.initSampleMode === 'build') {
      val = erp.sample(params);
      this.cacheTable[a] = val;
    } else if (this.initSampleMode === 'use') {
      val = this.cacheTable[a];
    } else throw new Error ('Invalid sample mode. Shoule be one of - use/build/none');
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
    // observe acts like factor (hence factor is called in the end), but
    // it returns a value unlike factor. So we need to pass a modified k
    // to factor.
    var factorCont = function(val){
      return function(s) {return k(s, val)};
    }
    if (this.initObserveMode === 'none') {
      assert (val !== undefined);
      var score = erp.score(params, val);
      return this.factor(s, factorCont(val), a, score);
    } else if (this.initObserveMode === 'build') {
      var val = erp.sample(params);
      var score = erp.score(params, val);
      this.cacheTable[a] = val;
      return this.factor(s, factorCont(val), a, score);
    }
    else if (this.initObserveMode === 'use') {
      var val = this.cacheTable[a];
      var score = (val === undefined) ? -Infinity : erp.score(params, val);
      return this.factor(s, factorCont(val), a, score);
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
    if (this.initSampleMode === 'build' || this.initObserveMode === 'build')
      return this.k(this.s, this.trace, this.cacheTable);
    else return this.k(this.s, this.trace);
  };

  Initialize.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return {
    Initialize: function(s, k, a, wpplFn, options) {
      return new Initialize(s, k, a, wpplFn, options).run();
    }
  };
};
