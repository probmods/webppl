'use strict';

var _ = require('lodash');
var assert = require('assert');
var Trace = require('../trace');
var ad = require('../ad');
var util = require('../util');

module.exports = function(env) {

  // Returns a trace which has a non-zero probability.

  var warnAfter = [1e3, 1e4, 1e5, 1e6];

  function Initialize(cont, wpplFn, s, k, a, options) {
    this.cont = cont;
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    options = util.mergeDefaults(options, {
      initSampleMode: 'none', // Modes - none, use, build
      initObserveMode: 'none', // Modes - none, use, build
      cacheTable: undefined
    });

    this.initSampleMode = options.initSampleMode;
    this.initObserveMode = options.initObserveMode;
    this.cacheTable = options.cacheTable;

    this.ad = options.ad;

    this.failures = 0;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  Initialize.prototype.run = function() {
    this.trace = new Trace(this.wpplFn, this.s, this.k, this.a);
    env.query.clear();
    return this.trace.continue();
  };

  Initialize.prototype.sample = function(s, k, a, dist, options) {
    var _val;
    if (this.initSampleMode === 'none') {
      _val = dist.sample();
    } else if (this.initSampleMode === 'build') {
      _val = dist.sample();
      this.cacheTable[a] = _val;
    } else if (this.initSampleMode === 'use') {
      _val = this.cacheTable[a];
    } else throw new Error ('Invalid sample mode. Shoule be one of - use/build/none');

    var val = this.ad && dist.isContinuous ? ad.lift(_val) : _val;
    this.trace.addChoice(dist, val, a, s, k, options);
    return k(s, val);
  };

  Initialize.prototype.factor = function(s, k, a, score) {
    if (ad.value(score) === -Infinity) {
      return this.fail();
    }
    this.trace.score = ad.scalar.add(this.trace.score, score);
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
    if (this.trace.value === env.query) {
      this.trace.value = env.query.getTable();
    }
    env.coroutine = this.oldCoroutine;

    if (this.initSampleMode === 'build' || this.initObserveMode === 'build') {
      return this.cont(this.trace, this.cacheTable);
    } else {
      return this.cont(this.trace);
    }
  };

  Initialize.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return function(cont, wpplFn, s, k, a, options) {
    return new Initialize(cont, wpplFn, s, k, a, options).run();
  };

};
