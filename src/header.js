////////////////////////////////////////////////////////////////////
// Inference interface
//
// An inference function takes the current continuation and a WebPPL
// thunk (which itself has been transformed to take a
// continuation). It does some kind of inference and returns an ERP
// representing the nromalized marginal distribution on return values.
//
// The inference function should install a coroutine object that
// provides sample, factor, and exit.
//
// sample and factor are the co-routine handlers: they get call/cc'ed
// from the wppl code to handle random stuff.
//
// The inference function passes exit to the wppl fn, so that it gets
// called when the fn is exited, it can call the inference cc when
// inference is done to contintue the program.

'use strict';

var assert = require('assert');
var _ = require('underscore');

var util = require('./util.js');
var erp = require('./erp.js');
var enumerate = require('./inference/enumerate.js');
var particlefilter = require('./inference/particlefilter.js');
var asyncpf = require('./inference/asyncpf.js');
var mh = require('./inference/mh.js');
var hashmh = require('./inference/hashmh.js');
var pmcmc = require('./inference/pmcmc.js');
var smc = require('./inference/smc.js');
var variational = require('./inference/variational.js');
var incrementalmh = require('./inference/incrementalmh.js');
var forwardsample = require('./inference/forwardsample.js');
var headerUtils = require('./headerUtils.js');
var Query = require('./query.js').Query;


module.exports = function(env) {


  // Inference interface

  env.coroutine = {
    sample: function(s, cc, a, erp, params) {
      return cc(s, erp.sample(params));
    },
    factor: function() {
      throw 'factor allowed only inside inference.';
    },
    exit: function(s, r) {
      return r;
    },
    incrementalize: function(s, cc, a, fn, args) {
      var args = [s, cc, a].concat(args);
      return fn.apply(global, args);
    }
  };

  env.defaultCoroutine = env.coroutine;

  env.sample = function(s, k, a, dist, params) {
    return env.coroutine.sample(s, k, a, dist, params);
  };

  env.factor = function(s, k, a, score) {
    assert.ok(!isNaN(score));
    return env.coroutine.factor(s, k, a, score);
  };

  env.sampleWithFactor = function(s, k, a, dist, params, scoreFn) {
    if (typeof env.coroutine.sampleWithFactor === 'function') {
      return env.coroutine.sampleWithFactor(s, k, a, dist, params, scoreFn);
    } else {
      var sampleK = function(s, v) {
        var scoreK = function(s, sc) {
          var factorK = function(s) {
            return k(s, v);
          };
          return env.factor(s, factorK, a + 'swf2', sc);
        };
        return scoreFn(s, scoreK, a + 'swf1', v);
      };
      return env.sample(s, sampleK, a, dist, params);
    }
  };

  env.exit = function(s, retval) {
    return env.coroutine.exit(s, retval);
  };

  env.incrementalize = function(s, cc, a, fn, args) {
    args = args || [];
    return env.coroutine.incrementalize(s, cc, a, fn, args);
  }

  // Inference coroutines are responsible for managing this correctly.
  env.query = new Query();


  // Exports

  var exports = {
    top: util.runningInBrowser() ? window : global
  };

  function addExports(obj) {
    _.extend(exports, obj);
  }

  // Inference interface
  addExports({
    factor: env.factor,
    sample: env.sample,
    sampleWithFactor: env.sampleWithFactor,
    incrementalize: env.incrementalize,
    query: env.query
  });

  // Modules we want to use from webppl
  addExports({
    _: _,
    util: util,
    assert: assert
  });

  // Inference functions and header utils
  var headerModules = [
    enumerate, particlefilter, asyncpf, mh, hashmh, incrementalmh, pmcmc,
    smc, variational, forwardsample, headerUtils
  ];
  headerModules.forEach(function(mod) {
    addExports(mod(env));
  });

  // Random primitives
  addExports(erp);

  return exports;

};
