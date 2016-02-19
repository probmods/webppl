'use strict';

var _ = require('underscore');
var seedrandom = require('seedrandom');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
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
      poisson: true,
      cauchy: true,
      mixed1: true,
      mixed2: true,
      mixed3: true,
      mixed4: true,
      bivariateGaussian: true,
      indirectDependency: true
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
      deterministic: { hist: { exact: true } },
      store: { hist: { exact: true } },
      geometric: { args: [10] },
      cache: true,
      withCaching: true,
      optionalErpParams: true,
      earlyExit: { hist: { exact: true } },
      zeroProb: { hist: { exact: true } },
      nestedEnumDiscrete: true
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
      query: true,
      onlyMAP: { mean: { tol: 0.1 }, args: [150, { onlyMAP: true }] }
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
      optionalErpParams: true,
      nestedEnum1: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum2: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum3: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum6: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum7: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum8: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnumDiscrete: true,
      nestedEnumWithFactor: { mean: { tol: 0.05 }, std: { tol: 0.05 } }
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
      notapes: { hist: { tol: 0 }, args: { samples: 100 } },
      gaussianMean: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 10000 } },
      varFactors1: { args: { particles: 5000 } },
      varFactors2: true,
      importance: true,
      importance2: { args: { particles: 3000 } },
      importance3: true,
      withCaching: true,
      optionalErpParams: true,
      nestedEnum1: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum2: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum3: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum6: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum7: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum8: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnumWithFactor: { mean: { tol: 0.05 }, std: { tol: 0.05 } }
    }
  },
  {
    name: 'ParticleFilterRejuvMH',
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
      notapes: { hist: { tol: 0 }, args: { samples: 100 } },
      geometric: true,
      drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: { particles: 1000, rejuvSteps: 15 } },
      varFactors1: true,
      varFactors2: true,
      importance: true,
      importance2: { args: { particles: 3000, rejuvSteps: 10 } },
      importance3: true,
      withCaching: true,
      optionalErpParams: true,
      variableSupport: true,
      nestedEnumWithFactor: { mean: { tol: 0.05 }, std: { tol: 0.05 } }
    }
  },
  {
    name: 'ParticleFilterRejuvHMC',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      logZ: { check: true, tol: 0.1 },
      MAP: { tol: 0.1, check: true },
      args: { particles: 1000, rejuvSteps: 10, rejuvKernel: 'HMC' }
    },
    models: {
      simple: true,
      deterministic: { hist: { tol: 0 } },
      store: { hist: { tol: 0 } },
      store2: { hist: { tol: 0 } },
      drift: {
        mean: { tol: 0.3 },
        std: { tol: 0.3 }
      },
      nestedEnumWithFactor: { mean: { tol: 0.05 }, std: { tol: 0.05 } }
    }
  },
  {
    name: 'ParticleFilterAsMH',
    func: 'SMC',
    settings: {
      hist: { tol: 0.1 },
      MAP: { tol: 0.1, check: true },
      args: { particles: 1, rejuvSteps: 10000, rejuvKernel: { MH: { permissive: true } } }
    },
    models: {
      simple: true,
      cache: true,
      deterministic: {
        hist: { tol: 0 },
        args: { particles: 1, rejuvSteps: 100, rejuvKernel: { MH: { permissive: true } } }
      },
      store: {
        hist: { tol: 0 },
        args: { particles: 1, rejuvSteps: 100, rejuvKernel: { MH: { permissive: true } } }
      },
      store2: {
        hist: { tol: 0 },
        args: { particles: 1, rejuvSteps: 100, rejuvKernel: { MH: { permissive: true } } }
      },
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
      notapes: { hist: { tol: 0 }, args: { samples: 100 } },
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
      query: true,
      onlyMAP: { mean: { tol: 0.1 }, args: { samples: 150, onlyMAP: true } },
      nestedEnum1: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum2: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum3: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum6: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum7: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum8: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnumWithFactor: { mean: { tol: 0.05 }, std: { tol: 0.05 } }
    }
  },
  {
    name: 'HMC',
    func: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      mean: { tol: 0.2 },
      std: { tol: 0.2 },
      MAP: { tol: 0.1, check: true },
      args: { samples: 1000, kernel: 'HMC' }
    },
    models: {
      deterministic: { hist: { tol: 0 } },
      simple: true,
      cache: true,
      store: { hist: { tol: 0 } },
      store2: { hist: { tol: 0 } },
      geometric: true,
      withCaching: true,
      optionalErpParams: true,
      variableSupport: true,
      query: true,
      onlyMAP: { mean: { tol: 0.1 }, args: { samples: 150, kernel: 'HMC', onlyMAP: true } },
      mixed1: true,
      mixed1Factor: true,
      mixed2: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      mixed2Factor: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      mixed3: {
        hist: { tol: 0.15 },
        args: {
          samples: 2000,
          kernel: { HMC: { steps: 20, stepSize: 1 } }
        }
      },
      mixed3Factor: {
        hist: { tol: 0.15 },
        args: {
          samples: 2000,
          kernel: { HMC: { steps: 20, stepSize: 1 } }
        }
      },
      mixed4: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      mixed4Factor: {
        args: {
          samples: 6000,
          burn: 1000,
          kernel: { HMC: { steps: 5, stepSize: 1 } }
        }
      },
      gaussianMean: true,
      gaussianMeanVar: {
        args: {
          samples: 1000,
          burn: 10,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      bivariateGaussian: {
        args: {
          samples: 1000,
          burn: 10,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      bivariateGaussianFactor: {
        args: {
          samples: 2000,
          burn: 10,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      indirectDependency: {
        args: {
          samples: 1000,
          burn: 100,
          kernel: { HMC: { steps: 20, stepSize: 0.1 } }
        }
      },
      constrainedSum: {
        hist: { tol: 0.1 },
        args: {
          samples: 500,
          burn: 50,
          kernel: { HMC: { steps: 50, stepSize: 0.004 } }
        }
      },
      nestedEnum1: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum2: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum3: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum4: { hist: { exact: true } },
      nestedEnum5: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum6: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum7: { mean: { tol: 0.05 }, std: { tol: 0.05 } },
      nestedEnum8: {
        mean: { tol: 0.05 },
        std: { tol: 0.05 },
        args: {
          samples: 2000,
          kernel: { HMC: { steps: 20, stepSize: 0.2 } }
        }
      },
      nestedEnumWithFactor: { mean: { tol: 0.05 }, std: { tol: 0.05 } }
    }
  },
  {
    name: 'HMConly',
    func: 'MCMC',
    settings: {
      hist: { tol: 0.1 },
      mean: { tol: 0.3 },
      std: { tol: 0.3 },
      args: { samples: 1000, kernel: 'HMConly' }
    },
    models: {
      deterministic: { hist: { tol: 0 } },
      gaussianMean: true
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
  return _.isArray(args) ? args.map(util.serialize) : util.serialize(args);
};

var testFunctions = {
  hist: function(test, result, expected, args) {
    var eq = args.exact ? _.isEqual : util.histsApproximatelyEqual;
    var actual = _.mapObject(result.erp.hist, function(obj) { return obj.prob; });
    var msg = ['Expected hist: ', util.serialize(expected),
               ', actual: ', util.serialize(actual)].join('');
    test.ok(eq(actual, expected, args.tol), msg);
  },
  mean: function(test, result, expected, args) {
    helpers.testWithinTolerance(test, util.histExpectation(result.erp.hist), expected, args.tol, 'mean');
  },
  std: function(test, result, expected, args) {
    helpers.testWithinTolerance(test, util.histStd(result.erp.hist), expected, args.tol, 'std');
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

var seed = helpers.getRandomSeedFromEnv() || Math.abs(seedrandom().int32());
console.log('Random seed: ' + seed);
generateTestCases(seed);
