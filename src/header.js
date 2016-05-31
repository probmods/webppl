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
  var sampleGuide = require('./inference/sampleGuide');
  var evaluateGuide = require('./inference/evaluateGuide');
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
    sample: function(s, k, a, dist) {
      return k(s, dist.sample());
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
    }
  };

  env.defaultCoroutine = env.coroutine;

  env.sample = function(s, k, a, dist, options) {
    if (!dists.isDist(dist)) {
      throw 'sample() expected a distribution but received \"' + JSON.stringify(dist) + '\".';
    }
    return env.coroutine.sample(s, k, a, dist, options);
  };

  env.factor = function(s, k, a, score) {
    assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
    return env.coroutine.factor(s, k, a, score);
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

  env.registerParams = function(name, getParams, setParams) {

    // getParams is expected to be a function which is used to
    // initialize parameters the first time they are encoutered. At
    // present I consider it to be `registerParams` responsibility to
    // perform lifting of params, so ideally `getParams` would not
    // return lifted params. However, in the case of NN, `getParams`
    // returns params already lifted. Hence, `getParams()` is replaced
    // with `getParams().map(ad.value)` throughout this function.

    // TODO: Don't lift params if the current coroutine isn't tracking
    // paramsSeen?

    var paramStore = env.coroutine.params;
    var paramsSeen = env.coroutine.paramsSeen;

    if (paramStore === undefined) {

      // Some coroutines ignore the guide when sampling (e.g. MH as
      // rejuv kernel) but still have to execute it while executing
      // the target. To ensure the guide doesn't error out, we return
      // something sensible from registerParams in such cases.

      return getParams().map(ad.value);

    } else if (paramsSeen && _.has(paramsSeen, name)) {

      // We've already lifted these params during this execution.
      // Re-use ad graph nodes.

      return paramsSeen[name];

    } else {

      // This is the first time we've encounter these params during
      // this execution. we will lift params at this point.

      var params;

      if (_.has(paramStore, name)) {
        // Seen on previous execution. Fetch from store and lift.
        params = paramStore[name].map(ad.lift);
      } else {
        // Never seen. Fetch initial values, add to store and lift.
        var _params = getParams().map(ad.value);
        paramStore[name] = _params;
        params = _params.map(ad.lift);
      }

      if (paramsSeen) {
        paramsSeen[name] = params;
      }

      // Callback with the fresh ad graph nodes.
      if (setParams) {
        setParams(params);
      }

      return params;
    }

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
    smc, rejection, optimize, sampleGuide, evaluateGuide, headerUtils
  ];
  headerModules.forEach(function(mod) {
    addExports(mod(env));
  });

  // TODO: Come up with a better way to get at this from packages. i.e. daipp.
  addExports({registerParams: env.registerParams});

  return exports;

};
