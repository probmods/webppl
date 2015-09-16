'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util.js');
var webppl = require('../src/main.js');
var erp = require('../src/erp.js');
var helpers = require('./helpers.js');


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
      stdGaussian: { args: [10000] },
      uniform: { args: [10000] },
      stdUniform: { args: [10000] },
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
      store: { hist: { tol: 0 } },
      geometric: { args: [10] },
      cache: true,
      stochasticCache: true,
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'MH',
    settings: {
      args: [5000],
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] },
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'HashMH',
    settings: {
      args: [5000],
      hist: { tol: 0.1 }
      //MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] },
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
      cache: true,
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] },
      withCaching: true,
      optionalErpParams: true
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
      store: { hist: { tol: 0 }, args: [30, 30] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [1000, 100] },
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'PFRj',
    func: 'ParticleFilterRejuv',
    settings: {
      args: [1000, 10],
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: [30, 30] },
      geometric: true,
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [1000, 15] },
      varFactors1: { args: [5000, 0] },
      varFactors2: true,
      importance: true,
      importance2: { args: [3000, 10] },
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'PFRjAsMH',
    func: 'ParticleFilterRejuv',
    settings: {
      args: [1, 10000],
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: [1, 100] },
      geometric: true,
      varFactors1: { args: [5000, 0] },
      varFactors2: true,
      importance: true,
      importance2: true,
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'PFRjAsParticleFilter',
    func: 'ParticleFilterRejuv',
    settings: {
      args: [1000, 0],
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: [100, 0] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [10000, 0] },
      varFactors1: { args: [5000, 0] },
      varFactors2: true,
      importance: true,
      importance2: { args: [3000, 0] },
      withCaching: true,
      optionalErpParams: true
      // varFactors1: { args: [5000, 0] },
      // varFactors2: true
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
    name: 'ParticleFilter',
    settings: {
      args: [1000],
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      cache: true,
      store: { hist: { tol: 0 }, args: [100] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [10000] },
      varFactors1: { args: [5000] },
      varFactors2: true,
      importance: true,
      importance2: { args: [3000] },
      withCaching: true,
      optionalErpParams: true
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
  }
];

var wpplRunInference = function(modelName, testDef) {
  var inferenceFunc = testDef.func || testDef.name;
  var inferenceArgs = getInferenceArgs(testDef, modelName);
  var progText = [
    helpers.loadModel(testDataDir, modelName),
    inferenceFunc, '(', ['model'].concat(inferenceArgs).join(', '), ');'
  ].join('');
  var erp;
  webppl.run(progText, function(s, val) { erp = val; });
  return erp;
};

var performTest = function(modelName, testDef, test) {
  var erp = wpplRunInference(modelName, testDef);
  var hist = getHist(erp);
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
    testFunctions[testName](test, erp, hist, expected, testArgs);
  });

  test.done();
};

var getInferenceArgs = function(testDef, model) {
  var args = (testDef.models[model] && testDef.models[model].args) || testDef.settings.args;
  return args.map(JSON.stringify);
};

var testFunctions = {
  hist: function(test, erp, hist, expected, args) {
    test.ok(util.histsApproximatelyEqual(hist, expected, args.tol));
  },
  mean: function(test, erp, hist, expected, args) {
    helpers.testWithinTolerance(test, util.expectation(hist), expected, args.tol, 'mean');
  },
  std: function(test, erp, hist, expected, args) {
    helpers.testWithinTolerance(test, util.std(hist), expected, args.tol, 'std');
  },
  logZ: function(test, erp, hist, expected, args) {
    if (args.check) {
      helpers.testWithinTolerance(test, erp.normalizationConstant, expected, args.tol, 'logZ');
    }
  },
  MAP: function(test, erp, hist, expected, args) {
    if (args.check) {
      var map = erp.MAP();
      helpers.testEqual(test, map.val, expected.val, 'MAP value');
      helpers.testWithinTolerance(test, map.prob, expected.prob, args.tol, 'MAP probabilty');
    }
  }
};

var getHist = function(erp) {
  var hist = {};
  erp.support().forEach(function(value) {
    hist[value] = Math.exp(erp.score([], value));
  });
  return util.normalizeHist(hist);
};

var generateTestCases = function() {
  var modelNames = helpers.getModelNames(testDataDir);
  _.each(tests, function(testDef) {
    exports[testDef.name] = {};
    _.each(modelNames, function(modelName) {
      if (testDef.models[modelName]) {
        exports[testDef.name][modelName] = _.partial(performTest, modelName, testDef);
      }
    });
  });
};

generateTestCases();
