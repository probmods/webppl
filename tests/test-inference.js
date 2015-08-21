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
      upweight: true,
      incrementalBinomial: true,
      store: { hist: { tol: 0 } },
      geometric: true,
      liftERP: { hist: { tol: 0.0001 } },
      cache: true,
      stochasticCache: true,
      withCaching: true,
      optionalErpParams: true
    }
  },
  {
    name: 'MHPrev',
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
      optionalErpParams: true,
      variableSupport: true
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
    name: 'PFRjPrev',
    func: 'ParticleFilterRejuvPrev',
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
    name: 'PFRjAsMHPrev',
    func: 'ParticleFilterRejuvPrev',
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
    name: 'PFRjAsParticleFilterPrev',
    func: 'ParticleFilterRejuvPrev',
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
    name: 'ParticleFilterPrev',
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
  },
  {
    name: 'ParticleFilter',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: { args: '{ particles: 1000 }' },
      cache: { args: '{ particles: 1000 }' },
      deterministic: { args: '{ particles: 1000 }' },
      store: { hist: { tol: 0 }, args: '{ particles: 100 }' },
      store2: { hist: { tol: 0 }, args: '{ particles: 100 }' },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: '{ particles: 10000 }' },
      varFactors1: { args: '{ particles: 5000 }' },
      varFactors2: { args: '{ particles: 1000 }' },
      importance: { args: '{ particles: 1000 }' },
      importance2: { args: '{ particles: 3000 }' },
      withCaching: { args: '{ particles: 1000 }' },
      optionalErpParams: { args: '{ particles: 1000 }' }
    }
  },
  {
    name: 'ParticleFilterRejuv',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      cache: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      deterministic: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      store: { hist: { tol: 0 }, args: '{ particles: 30, rejuvSteps: 30 }' },
      store2: { hist: { tol: 0 }, args: '{ particles: 30, rejuvSteps: 30 }' },
      geometric: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: '{ particles: 1000, rejuvSteps: 15 }' },
      importance: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      importance2: { args: '{ particles: 3000, rejuvSteps: 10 }' },
      withCaching: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      optionalErpParams: { args: '{ particles: 1000, rejuvSteps: 10 }' },
      variableSupport: { args: '{ particles: 1000, rejuvSteps: 10 }' }
    }
  },
  {
    name: 'ParticleFilterAsMH',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: { args: '{ particles: 1, rejuvSteps: 10000 }' },
      cache: { args: '{ particles: 1, rejuvSteps: 10000 }' },
      store: { hist: { tol: 0 }, args: '{ particles: 1, rejuvSteps: 100 }' },
      store2: { hist: { tol: 0 }, args: '{ particles: 1, rejuvSteps: 100 }' },
      geometric: { args: '{ particles: 1, rejuvSteps: 10000 }' },
      importance: { args: '{ particles: 1, rejuvSteps: 10000 }' },
      importance2: { args: '{ particles: 1, rejuvSteps: 10000 }' },
      optionalErpParams: { args: '{ particles: 1, rejuvSteps: 10000 }' },
      variableSupport: { args: '{ particles: 1, rejuvSteps: 10000 }' }
    }
  },
  {
    name: 'MH',
    func: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true }
    },
    models: {
      simple: { args: '{ samples: 5000 }' },
      cache: { args: '{ samples: 5000 }' },
      deterministic: { args: '{ samples: 1000 }' },
      store: { hist: { tol: 0 }, args: '{ samples: 100 }' },
      geometric: { args: '{ samples: 5000 }' },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: '{ samples: 80000, burn: 20000 }' },
      drift: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 },
        args: '{ samples: 80000, burn: 20000 }'
      },
      withCaching: { args: '{ samples: 5000 }' },
      optionalErpParams: { args: '{ samples: 5000 }' },
      variableSupport: { args: '{ samples: 5000 }' }
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
  return (testDef.models[model] && testDef.models[model].args) || testDef.settings.args;
};

var testWithinTolerance = function(test, actual, expected, tolerance, name) {
  var absDiff = Math.abs(actual - expected);
  var msg = ['Expected ', name, ': ', expected, ', actual: ', actual].join('');
  test.ok(absDiff < tolerance, msg);
};

var testEqual = function(test, actual, expected, name) {
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
  MAP: function(test, erp, hist, expected, args) {
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
