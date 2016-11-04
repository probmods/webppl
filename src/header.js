////////////////////////////////////////////////////////////////////
// Inference interface
//
// An inference function takes the current continuation and a WebPPL
// thunk (which itself has been transformed to take a
// continuation). It does some kind of inference and returns a distribution
// representing the normalized marginal distribution on return values.
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
var nn = require('adnn/nn');

try {
  var util = require('./util');
  var dists = require('./dists');
  var enumerate = require('./inference/enumerate');
  var mcmc = require('./inference/mcmc');
  var asyncpf = require('./inference/asyncpf');
  var pmcmc = require('./inference/pmcmc');
  var smc = require('./inference/smc');
  var rejection = require('./inference/rejection');
  var incrementalmh = require('./inference/incrementalmh');
  var optimize = require('./inference/optimize');
  var forwardSample = require('./inference/forwardSample');
  var dreamSample = require('./inference/dreamSample');
  var headerUtils = require('./headerUtils');
  var Query = require('./query').Query;
  var ad = require('./ad');
  var Tensor = require('./tensor');
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.error(e.message);
    console.error('Run ./scripts/adify and try again.');
    process.exit();
  } else {
    throw e;
  }
}

module.exports = function(env) {


  // Inference interface

  env.defaultCoroutine = {
    sample: function(s, k, a, dist) {
      return k(s, dist.sample());
    },
    factor: function() {
      throw new Error('factor allowed only inside inference.');
    },
    exit: function(s, r) {
      return r;
    },
    incrementalize: function(s, k, a, fn, args) {
      var args = [s, k, a].concat(args);
      return fn.apply(global, args);
    },
    a: '' // Entry address. Enables relative addressing.
  };

  // Used to ensure that env is in a predictable state when running
  // multiple programs in a single process.
  env.reset = function() {
    env.coroutine = env.defaultCoroutine;
  };
  env.reset();

  env.sample = function(s, k, a, dist, options) {
    if (!dists.isDist(dist)) {
      throw new Error('sample() expected a distribution but received \"' + JSON.stringify(dist) + '\".');
    }
    return env.coroutine.sample(s, k, a, dist, options);
  };

  env.factor = function(s, k, a, score) {
    assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
    return env.coroutine.factor(s, k, a, score);
  };

  // If observatin value is given then factor accordingly,
  // otherwise sample a new value.
  // The value is passed to the continuation.
  env.observe = function(s, k, a, dist, val) {
    if (typeof env.coroutine.observe === 'function') {
      return env.coroutine.observe(s, k, a, dist, val);
    } else {
      if (val !== undefined) {
        var factorK = function(s) {
          return k(s, val);
        };
        return env.factor(s, factorK, a, dist.score(val));
      } else {
        return env.sample(s, k, a, dist);
      }
    }
  };

  env.sampleWithFactor = function(s, k, a, dist, scoreFn) {
    if (typeof env.coroutine.sampleWithFactor === 'function') {
      return env.coroutine.sampleWithFactor(s, k, a, dist, scoreFn);
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
      return env.sample(s, sampleK, a, dist);
    }
  };

  env.exit = function(s, retval) {
    return env.coroutine.exit(s, retval);
  };

  env.incrementalize = function(s, k, a, fn, args) {
    args = args || [];
    return env.coroutine.incrementalize(s, k, a, fn, args);
  };

  // Inference coroutines are responsible for managing this correctly.
  env.query = new Query();

  // Exports

  var exports = {
    _top: util.runningInBrowser() ? window : global
  };

  function addExports(obj) {
    _.extend(exports, obj);
  }

  // Inference interface
  addExports({
    factor: env.factor,
    sample: env.sample,
    sampleWithFactor: env.sampleWithFactor,
    observe: env.observe,
    incrementalize: env.incrementalize,
    query: env.query
  });

  // Modules we want to use from webppl
  addExports({
    _: _,
    util: util,
    assert: assert,
    ad: ad,
    nn: nn,
    T: ad.tensor,
    dists: dists
  });

  // Inference functions and header utils
  var headerModules = [
    enumerate, asyncpf, mcmc, incrementalmh, pmcmc,
    smc, rejection, optimize, dreamSample, forwardSample,
    headerUtils
  ];
  headerModules.forEach(function(mod) {
    addExports(mod(env));
  });

  return exports;

};
