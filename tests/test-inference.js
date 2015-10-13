'use strict';

var _ = require('underscore');
var seedrandom = require('seedrandom');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var erp = require('../src/erp');
var helpers = require('./helpers');


var testDataDir = './tests/test-data/stochastic/';

var tests = [
  {
    name: 'ForwardSample',
    func: 'Rejection',
    settings: {
      args: [3000],
      hist: { tol: 0.05 },
      mean: { tol: 0.2 },
      std: { tol: 0.2 }
    },
    models: {
      deterministic: { args: [10], hist: { tol: 0 } },
      flips: true,
      geometric: true,
      randomInteger: true,
      gaussian: { args: [10000] },
      uniform: { args: [10000] },
      beta: true,
      exponential: true,
      binomial: true,
      poisson: true
    }
  },
  {
    name: 'Enumerate',
    settings: {
      args: [],
      MAP: { check: true }
    },
    models: {
      simple: true,
      upweight: true,
      incrementalBinomial: true,
      deterministic: { hist: { tol: 0 } },
      store: { hist: { tol: 0 } },
      geometric: { args: [10] },
      cache: true,
      stochasticCache: true,
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'IncrementalMH',
    settings: {
      args: [5000],
      hist: { tol: 0.1 }
      //MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      deterministic: { hist: { tol: 0 }, args: [100] },
      cache: true,
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000] },
      withCaching: true,
      optionalErpParams: true,
      variableSupport: true,
      query: true
    }
  },
  {
    name: 'IMHjustSample',
    func: 'IncrementalMH',
    settings: {
      args: [100, { justSample: true }]
    },
    models: {
      deterministic: { hist: { tol: 0 } }
    }
  },
  {
    name: 'IMHonlyMAP',
    func: 'IncrementalMH',
    settings: {
      args: [100, { onlyMAP: true }]
    },
    models: {
      deterministic: { hist: { tol: 0 } }
    }
  },
  {
    name: 'PMCMC',
    settings: {
      args: [1000, 5],
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: [30, 30] },
      store: { hist: { tol: 0 }, args: [30, 30] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [1000, 100] },
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'AsyncPF',
    settings: {
      args: [1000, 1000],
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      store: { hist: { tol: 0 }, args: [100, 100] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [10000, 1000] },
      withCaching: true
    }
  },
  {
    name: 'Rejection',
    settings: {
      args: [1000],
      hist: { tol: 0.1 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 } },
      upweight: { args: [1000, 10] },
      incrementalBinomial: { args: [1000, -2] },
      store: { hist: { tol: 0 } },
      geometric: true,
      varFactors1: true,
      varFactors2: true,
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'IncrementalRejection',
    func: 'Rejection',
    settings: {
      args: [1000, 0, true],
      hist: { tol: 0.1 }
    },
    models: {
      simple: true,
      cache: true,
      incrementalBinomial: { args: [1000, -2, true] },
      store: { hist: { tol: 0 } },
      geometric: true,
      varFactors2: true,
      optionalErpParams: true
    }
  },
  {
    name: 'ParticleFilter',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true },
      args: { particles: 1000 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { particles: 100 } },
      store: { hist: { tol: 0 }, args: { particles: 100 } },
      store2: { hist: { tol: 0 }, args: { particles: 100 } },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 10000 } },
      varFactors1: { args: { particles: 5000 } },
      varFactors2: true,
      importance: true,
      importance2: { args: { particles: 3000 } },
      importance3: true,
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'ParticleFilterRejuv',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true },
      args: { particles: 1000, rejuvSteps: 10 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { particles: 30, rejuvSteps: 30 } },
      store: { hist: { tol: 0 }, args: { particles: 30, rejuvSteps: 30 } },
      store2: { hist: { tol: 0 }, args: { particles: 30, rejuvSteps: 30 } },
      geometric: true,
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 1000, rejuvSteps: 15 } },
      importance: true,
      importance2: { args: { particles: 3000, rejuvSteps: 10 } },
      importance3: true,
      withCaching: true,
      optionalErpParams: true,
      variableSupport: true
    }
  },
  {
    name: 'ParticleFilterAsMH',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true },
      args: { particles: 1, rejuvSteps: 10000 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { particles: 1, rejuvSteps: 100 } },
      store: { hist: { tol: 0 }, args: { particles: 1, rejuvSteps: 100 } },
      store2: { hist: { tol: 0 }, args: { particles: 1, rejuvSteps: 100 } },
      geometric: true,
      importance: true,
      importance2: true,
      importance3: true,
      optionalErpParams: true,
      variableSupport: true
    }
  },
  {
    name: 'MH',
    func: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true },
      args: { samples: 5000 }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: { hist: { tol: 0 }, args: { samples: 100 } },
      store: { hist: { tol: 0 }, args: { samples: 100 } },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { samples: 80000, burn: 20000 } },
      drift: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 },
        args: { samples: 80000, burn: 20000 }
      },
      withCaching: true,
      optionalErpParams: true,
      variableSupport: true,
      query: true
    }
  },
  {
    name: 'MHonlyMAP',
    func: 'MCMC',
    settings: {
      args: { samples: 100, onlyMAP: true }
    },
    models: {
      deterministic: { hist: { tol: 0 } }
    }
  },
  {
    name: 'MHjustSample',
    func: 'MCMC',
    settings: {
      args: { samples: 100, justSample: true }
    },
    models: {
      deterministic: { hist: { tol: 0 } }
    }
  }

];

var wpplRunInference = function(modelName, testDef) {
  var inferenceFunc = testDef.func || testDef.name;
  var inferenceArgs = getInferenceArgs(testDef, modelName);
  var progText = [
    helpers.loadModel(testDataDir, modelName),
    inferenceFunc, '(', ['model'].concat(inferenceArgs).join(', '), ');'
  ].join('');
  try {
    var retVal;
    webppl.run(progText, function(store, erp) { retVal = { store: store, erp: erp }; });
    return retVal;
  } catch (e) {
    console.log('Exception: ' + e);
    throw e;
  }
};

var performTest = function(modelName, testDef, test) {
  var result = wpplRunInference(modelName, testDef);
  result.hist = getHist(result.erp);
  var expectedResults = helpers.loadExpected(testDataDir, modelName);

  _.each(expectedResults, function(expected, testName) {
    // The tests to run for a particular model are determined by the contents
    // of the expected results JSON file.
    assert(testFunctions[testName], 'Unexpected key "' + testName + '"');
    var testArgs = _.extendOwn.apply(null, _.filter([
      { tol: 0.0001 }, // Defaults.
      testDef.settings[testName],
      testDef.models[modelName] && testDef.models[modelName][testName] // Most specific.
    ]));
    testFunctions[testName](test, result, expected, testArgs);
  });

  test.done();
};

var getInferenceArgs = function(testDef, model) {
  var args = (testDef.models[model] && testDef.models[model].args) || testDef.settings.args;
  return _.isArray(args) ? args.map(JSON.stringify) : JSON.stringify(args);
};

var testFunctions = {
  hist: function(test, result, expected, args) {
    test.ok(util.histsApproximatelyEqual(result.hist, expected, args.tol));
  },
  mean: function(test, result, expected, args) {
    helpers.testWithinTolerance(test, util.expectation(result.hist), expected, args.tol, 'mean');
  },
  std: function(test, result, expected, args) {
    helpers.testWithinTolerance(test, util.std(result.hist), expected, args.tol, 'std');
  },
  logZ: function(test, result, expected, args) {
    if (args.check) {
      helpers.testWithinTolerance(test, result.erp.normalizationConstant, expected, args.tol, 'logZ');
    }
  },
  MAP: function(test, result, expected, args) {
    if (args.check) {
      var map = result.erp.MAP();
      helpers.testEqual(test, map.val, expected.val, 'MAP value');
      helpers.testWithinTolerance(test, map.prob, expected.prob, args.tol, 'MAP probabilty');
    }
  },
  store: function(test, result, expected, args) {
    helpers.testEqual(test, result.store, expected, 'store');
  }
};

var getHist = function(erp) {
  var hist = {};
  erp.support().forEach(function(value) {
    hist[JSON.stringify(value)] = Math.exp(erp.score([], value));
  });
  return util.normalizeHist(hist);
};

var generateTestCases = function(seed) {
  _.each(tests, function(testDef) {
    exports[testDef.name] = {};
    _.each(_.keys(testDef.models), function(modelName) {
      exports[testDef.name][modelName] = _.partial(performTest, modelName, testDef);
    });
  });
  exports.setUp = function(callback) {
    util.seedRNG(seed);
    callback();
  };
  exports.tearDown = function(callback) {
    util.resetRNG();
    callback();
  };
};

function getRandomSeedFromEnv() {
  if (process.env.RANDOM_SEED) {
    var seed = parseInt(process.env.RANDOM_SEED);
    util.assertValidRandomSeed(seed);
    return seed;
  }
}

var seed = getRandomSeedFromEnv() || Math.abs(seedrandom().int32());
console.log('Random seed: ' + seed);
generateTestCases(seed);
