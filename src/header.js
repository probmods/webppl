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
var nn = require('adnn/nn');

try {
  var util = require('./util');
  var erp = require('./erp');
  var enumerate = require('./inference/enumerate');
  var mcmc = require('./inference/mcmc');
  var asyncpf = require('./inference/asyncpf');
  var pmcmc = require('./inference/pmcmc');
  var smc = require('./inference/smc');
  var rejection = require('./inference/rejection');
  var incrementalmh = require('./inference/incrementalmh');
  var optimize = require('./inference/optimize');
  var headerUtils = require('./headerUtils');
  var Query = require('./query').Query;
  var ad = require('./ad');
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.error(e.message);
    console.error('Run ./script/adify and try again.');
    process.exit();
  } else {
    throw e;
  }
}

module.exports = function(env) {


  // Inference interface

  env.coroutine = {
    sample: function(s, k, a, erp, params) {
      return k(s, erp.sample(params));
    },
    factor: function() {
      throw 'factor allowed only inside inference.';
    },
    exit: function(s, r) {
      return r;
    },
    incrementalize: function(s, k, a, fn, args) {
      var args = [s, k, a].concat(args);
      return fn.apply(global, args);
    },
    getParam: function(s, k, a, initFn) {
      return k(s, initFn());
    }
  };

  env.defaultCoroutine = env.coroutine;

  env.sample = function(s, k, a, erp, params, options) {
    return env.coroutine.sample(s, k, a, erp, params, options);
  };

  env.factor = function(s, k, a, score) {
    assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
    return env.coroutine.factor(s, k, a, score);
  };

  env.sampleWithFactor = function(s, k, a, erp, params, scoreFn) {
    if (typeof env.coroutine.sampleWithFactor === 'function') {
      return env.coroutine.sampleWithFactor(s, k, a, erp, params, scoreFn);
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
      return env.sample(s, sampleK, a, erp, params);
    }
  };

  env.exit = function(s, retval) {
    return env.coroutine.exit(s, retval);
  };

  env.incrementalize = function(s, k, a, fn, args) {
    args = args || [];
    return env.coroutine.incrementalize(s, k, a, fn, args);
  };

  env.getParam = function() {
    // If the current coroutine doesn't implement getParam, use the
    // default.
    var getParam = env.coroutine.getParam || env.defaultCoroutine.getParam;
    return getParam.apply(env.coroutine, arguments);
  };

  // Inference coroutines are responsible for managing this correctly.
  env.query = new Query();

  env.getRelativeAddress = function(address) {
    // Takes a full stack address and returns a new address relative
    // to the entry address of the current coroutine. This requires
    // each coroutine to save its entry address as `this.a`.

    // Note that the strategy used here needs to match up with the
    // strategy used when relativizing trace addresses. (Because
    // `getRelativeAddress` is used within EUBO to perform choice
    // look-ups.)

    // This is a JS function for ease of calling from within
    // coroutines. The webppl version comes from wrapping this in
    // headerUtils.js.

    // A better way to implement this might be to have each coroutine
    // inherit this implementation from a base "class". Within a
    // coroutine we'd then call `getRelativeAddress` on `this` rather
    // than `env`. This might also help with `incrementalize` and
    // `getParam`.

    // TODO: Does slicing addresses scale? (Also see #150.)

    assert.ok(_.has(env.coroutine, 'a'), 'Entry address not saved on coroutine.');
    var baseAddress = env.coroutine.a;
    assert.ok(address.startsWith(baseAddress));
    return address.slice(baseAddress.length);
  };

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
    incrementalize: env.incrementalize,
    query: env.query,
    getParam: env.getParam
  });

  // Modules we want to use from webppl
  addExports({
    _: _,
    util: util,
    assert: assert,
    ad: ad,
    nn: nn,
    T: ad.tensor
  });

  // Inference functions and header utils
  var headerModules = [
    enumerate, asyncpf, mcmc, incrementalmh, pmcmc,
    smc, rejection, optimize, headerUtils
  ];
  headerModules.forEach(function(mod) {
    addExports(mod(env));
  });

  // Random primitives
  addExports(erp);

  return exports;

};
