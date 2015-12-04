'use strict';

var _ = require('underscore');
var seedrandom = require('seedrandom');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var erp = require('../src/erp');
var helpers = require('./helpers');

// In this file, we test our ERP samplers by running them a bunch for various
// sample values and comparing the resulting *sample* statistics against mathematically
// derived *population* statistics. We also check that every sample is in the
// support of the distribution, so that modelers aren't bit by underflow or overflow

// suppress warnings (for, e.g., underflow)
global.suppressWarnings = true;
Error.stackTraceLimit = 0;

var repeat = function(n, f) {
  // used typedarray because node can run out of memory easily with lots of big arrays
  var a = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    a[i] = f()
  }
  return a;
}

var ln = Math.log,
    pow = Math.pow;

// cache sample statistics by attaching
// properties to the sample array
// e.g., a._mean, a._sd
// note that this requires f to be declared
// as function foo() { }
// rather than var foo = function() { }
var cache = function(f) {
  var key = f.name;
  return function(array) {
    if (!array[key]) {
      array[key] = f(array);
    }
    return array[key]
  }
}

function _mean(a) {
  var n = a.length;
  var sum = 0;
  for (var i = 0; i < n; i++) {
    sum += a[i];
  }
  return sum / n;
}
var mean = cache(_mean);

function _variance(a) {
  var n = a.length;
  var m = mean(a);
  var sum = 0;

  for (var i = 0; i < n; i++) {
    var v = a[i] - m;
    sum += v * v;
  }

  return sum / n;
}
// probably don't need to cache variance
var variance = cache(_variance);

function _sd(a) {
  return Math.sqrt(variance(a));
}
var sd = cache(_sd);

function _skew(a) {
  var n = a.length;
  var m = mean(a);
  var s = sd(a);
  var sum = 0;

  for (var i = 0; i < n; i++) {
    var v = a[i] - m;
    sum += pow(v, 3);
  }

  sum = sum / (pow(s, 3));

  return sum / n;
}
// probably don't need to cache skew
var skew = (_skew);

function _kurtosis(a) {
  var n = a.length;
  var m = mean(a);
  var s = sd(a);
  var sum = 0;

  for (var i = 0; i < n; i++) {
    var v = a[i] - m;
    sum += pow(v, 4);
  }

  sum = sum / (pow(s, 4));

  return sum / n;
}
// probably don't need to cache kurtosis
var kurtosis = (_kurtosis);

// estimate the mode of a continuous distribution from some
// samples by computing kde and returning the bin with
// max density
function kdeMode(samps) {
  var kernel = function(u) {
    return Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
  };

  // get optimal bandwidth
  // HT http://en.wikipedia.org/wiki/Kernel_density_estimation#Practical_estimation_of_the_bandwidth
  var n = samps.length;
  var s = sd(samps);

  var bandwidth = 1.06 * s * pow(n, -0.2);

  var min = _.min(samps);
  var max = _.max(samps);

  var numBins = (max - min) / bandwidth;

  var maxDensity = -Infinity;
  var maxEl;

  for (var i = 0; i <= numBins; i++) {
    var x = min + bandwidth * i;
    var kernel_sum = 0;
    for (var j = 0; j < samps.length; j++) {
      kernel_sum += kernel((x - samps[j]) / bandwidth);
    }
    if (kernel_sum > maxDensity) {
      maxDensity = kernel_sum;
      maxEl = x;
    }
  }
  return maxEl;
}

function _mode(a) {
  return kdeMode(a)
}
var mode = (_mode);

// sample statistic functions
var sampleStatisticFunctions = {
  mean: mean,
  variance: variance,
  skew: skew,
  kurtosis: kurtosis,
  mode: mode
}

// HT https://en.wikipedia.org/wiki/Digamma_function#Computation_and_approximation
var digamma = function(x) {
  if (x < 6)
    return digamma(x + 1) - 1 / x;

  return ln(x) -
      1 / (2 * x) -
      1 / (12 * pow(x, 2)) +
      1 / (120 * pow(x, 4)) -
      1 / (252 * pow(x, 6)) +
      1 / (240 * pow(x, 8)) -
      5 / (660 * pow(x, 10)) +
      691 / (32760 * pow(x, 12)) -
      1 / (12 * pow(x, 14));
}

// HT http://ms.mcmaster.ca/peter/s743/trigamma.html
// (cites formulas from abramowitz & stegun, which you can get at:
// http://people.math.sfu.ca/~cbm/aands/
var trigamma = function(x) {
  if (x < 30) {
    return trigamma(x + 1) + 1 / (x * x);
  }

  return 1 / x +
      1 / (2 * pow(x, 2)) +
      1 / (6 * pow(x, 3)) -
      1 / (30 * pow(x, 5)) +
      1 / (42 * pow(x, 7)) -
      1 / (30 * pow(x, 9))
}

var erpMetadataList = [
  {name: 'gamma',
    sampler: erp.gammaERP.sample,
    inSupport: function(params, x) {
      var giveLog = params[2];
      if (giveLog) {
        return typeof x === 'number' && x > -Infinity && x < Infinity;
      } else {
        return typeof x === 'number' && x > 0 && x < Infinity;
      }
    },
    settings: [
      // params are sampled to the ERP sampler
      // n is the number of samples we'll take
      // reltol is the relative tolerance
      // skip says that we'll skip certain statistics
      {params: [0.0001, 1 / 0.0001], n: 5e6, reltol: 0.25, skip: ['mode']},
      {params: [0.001, 1 / 0.001], n: 5e6, reltol: 0.15, skip: ['mode']},
      {params: [0.01, 1 / 0.01], n: 5e6, reltol: 0.15, skip: ['mode']},
      {params: [0.1, 1 / 0.1], n: 5e6, reltol: 0.15, skip: ['mode']},
      {params: [1, 1], n: 5e6, reltol: 0.15, skip: ['mode']},
      {params: [3, 9], n: 5e6, reltol: 0.15},
      {params: [300, 200], n: 5e6, reltol: 0.15},
      {params: [100006, 34], n: 5e6, reltol: 0.15},
      {params: [0.0001, 1 / 0.0001, true], n: 5e6, reltol: 0.25, skip: ['mode', 'skew', 'kurtosis']},
      {params: [0.001, 1 / 0.001, true], n: 5e6, reltol: 0.15, skip: ['mode', 'skew', 'kurtosis']},
      {params: [0.01, 1 / 0.01, true], n: 5e6, reltol: 0.15, skip: ['mode', 'skew', 'kurtosis']},
      {params: [0.1, 1 / 0.1, true], n: 5e6, reltol: 0.15, skip: ['mode', 'skew', 'kurtosis']},
      {params: [1, 1, true], n: 5e6, reltol: 0.15, skip: ['mode', 'skew', 'kurtosis']},
      {params: [3, 9, true], n: 5e6, reltol: 0.15, skip: ['skew', 'kurtosis']},
      {params: [300, 200, true], n: 5e6, reltol: 0.15, skip: ['skew', 'kurtosis']},
      {params: [100006, 34, true], n: 5e6, reltol: 0.15, skip: ['skew', 'kurtosis']}
    ],
    // mostly HT https://en.wikipedia.org/wiki/Gamma_distribution
    populationStatisticFunctions: {
      mean: function(params) {
        var shape = params[0];
        var scale = params[1];
        var giveLog = params[2];

        if (giveLog) {
          return digamma(shape) + ln(scale)
        } else {
          return shape * scale;
        }
      },
      mode: function(params) {
        var shape = params[0];
        var scale = params[1];
        var giveLog = params[2];

        // for shape > 1
        if (giveLog) {
          // HT http://stats.stackexchange.com/questions/40989/density-of-y-logx-for-gamma-distributed-x
          return ln(shape * scale);
        } else {
          return (shape - 1) * scale;
        }

      },
      variance: function(params) {
        var shape = params[0];
        var scale = params[1];
        var giveLog = params[2];

        if (giveLog) {
          return trigamma(shape)
        } else {
          return shape * scale * scale;
        }
      },
      skew: function(params) {
        var shape = params[0];
        // var scale = params[1]; // appease linter
        var giveLog = params[2];

        if (giveLog) {
          throw new Error('gamma skew not implemented for log samples');
        } else {
          return 2 / Math.sqrt(shape);
        }
      },
      kurtosis: function(params) {
        var shape = params[0];
        // var scale = params[1]; // appease linter
        var giveLog = params[2];

        if (giveLog) {
          throw new Error('gamma skew not implemented for log samples');
        } else {
          return 3 + 6 / shape;
        }
      }
    }
  }
];


var generateSettingTest = function(erpMetadata, settings) {
  var erpName = erpMetadata.name;

  // settings includes:
  // - params to the erp
  // - inference params (e.g., number of samples)
  // - test params (e.g., relative tolerance)
  var params = settings.params;
  var samples = repeat(settings.n, function() {
    return erpMetadata.sampler(params);
  });

  var testIdPrefix = erpName + '(' + params.join(',') + '): ';

  // check that every sample is in the support of the distribution
  var inSupport = erpMetadata.inSupport;
  exports[testIdPrefix + 'support'] = function(test) {
    test.ok(_.every(samples.map(function(x) { return inSupport(params, x) })));
    test.done();
  }

  var includedStats = _.omit(erpMetadata.populationStatisticFunctions,
                             function(v, k) {
                               return _.contains(settings.skip, k)
                             });

  _.each(includedStats, function(statFn, statName) {
    var expectedResult = statFn(params);
    var testId = testIdPrefix + statName;

    exports[testId] = function(test) {
      var sampleStatisticFunction = sampleStatisticFunctions[statName];
      var actualResult = sampleStatisticFunction(samples);
      helpers.testWithinTolerance(test,
                                  actualResult,
                                  expectedResult,
                                  Math.abs(settings.reltol * expectedResult),
                                  statName);
      test.done();
    }
  });
}

var generateTestCases = function(seed) {
  _.each(erpMetadataList, function(erpMetadata) {
    _.each(erpMetadata.settings, function(settings) {
      generateSettingTest(erpMetadata, settings)
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
