'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util.js');
var webppl = require('../src/main.js');
var erp = require('../src/erp.js');

var testDataDir = './tests/test-data/';

var tests = [
  {
    name: 'ForwardSample',
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
      uniform: { args: [10000] }
    }
  },
  {
    name: 'Enumerate',
    settings: {
      args: [10],
      MAP: { check: true }
    },
    models: {
      simple: true,
      store: { hist: { tol: 0 } },
      geometric: true,
      cache: true
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
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] }
    }
  },
  {
    name: 'HashMH',
    settings: {
      args: [5000],
      hist: { tol: 0.1 },
      //MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] }
    }
  },
  {
    name: 'IncrementalMH',
    settings: {
      args: [5000],
      hist: { tol: 0.1 },
      //MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] }
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
      store: { hist: { tol: 0 }, args: [30, 30] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [1000, 100] }
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
      store: { hist: { tol: 0 }, args: [30, 30] },
      geometric: true,
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [1000, 15] },
      importance: true,
      importance2: { args: [3000, 10] }
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
      store: { hist: { tol: 0 }, args: [100] },
      geometric: true,
      importance: true,
      importance2: true
    }
  },
  {
    name: 'PFRjAsParticleFilter',
    func: 'ParticleFilterRejuv',
    settings: {
      args: [1000, 0],
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: true,
      importance: true,
      importance2: { args: [3000] },
      store: { hist: { tol: 0 }, args: [100] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [10000] }
      // varFactors1: { args: [5000] },
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
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [10000, 1000] }
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
      store: { hist: { tol: 0 }, args: [100] },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [10000] },
      varFactors1: { args: [5000] },
      varFactors2: true,
      importance: true,
      importance2: { args: [3000] }
    }
  }
];

var wpplRunInference = function(modelName, testDef) {
  var inferenceFunc = testDef.func || testDef.name;
  var inferenceArgs = getInferenceArgs(testDef, modelName);
  var progText = [
    loadModel(modelName),
    inferenceFunc, '(model,', inferenceArgs, ');'
  ].join('');
  var erp;
  try {
    webppl.run(progText, function(s, val) { erp = val; });
  } catch (e) {
    console.log('Exception:' + e);
    throw e;
  }
  return erp;
};

var performTest = function(modelName, testDef, test) {
  var erp = wpplRunInference(modelName, testDef);
  var hist = getHist(erp);
  var expectedResults = loadExpected(modelName);

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
  return JSON.stringify(args).slice(1, -1);
};

var testWithinTolerance = function(test, actual, expected, tolerance, name) {
  var absDiff = Math.abs(actual - expected);
  var msg = ['Expected ', name, ': ', expected, ', actual: ', actual].join('');
  test.ok(absDiff < tolerance, msg);
};

var testEqual = function (test, actual, expected, name) {
  var msg = ['Expected ', name, ': ', expected, ', actual: ', actual].join('');
  test.ok(actual === expected, msg);
};

var testFunctions = {
  hist: function(test, erp, hist, expected, args) {
    test.ok(util.histsApproximatelyEqual(hist, expected, args.tol));
  },
  mean: function(test, erp, hist, expected, args) {
    testWithinTolerance(test, util.expectation(hist), expected, args.tol, 'mean');
  },
  std: function(test, erp, hist, expected, args) {
    testWithinTolerance(test, util.std(hist), expected, args.tol, 'std');
  },
  logZ: function(test, erp, hist, expected, args) {
    if (args.check) {
      testWithinTolerance(test, erp.normalizationConstant, expected, args.tol, 'logZ');
    }
  },
  MAP: function (test, erp, hist, expected, args) {
    if (args.check) {
      var map = erp.MAP();
      testEqual(test, map.val, expected.val, 'MAP value');
      testWithinTolerance(test, map.prob, expected.prob, args.tol, 'MAP probabilty');
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

var getModelNames = function() {
  var filenames = fs.readdirSync(testDataDir + 'models/');
  return _.map(filenames, function(fn) { return fn.split('.')[0]; });
};

var loadModel = function(modelName) {
  var filename = testDataDir + 'models/' + modelName + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var loadExpected = function(modelName) {
  var filename = testDataDir + 'expected/' + modelName + '.json';
  return JSON.parse(fs.readFileSync(filename, 'utf-8'));
};

var generateTestCases = function() {
  var modelNames = getModelNames();
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
