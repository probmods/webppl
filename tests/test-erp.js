'use strict';

var _ = require('underscore');
var seedrandom = require('seedrandom');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var erp = require('../src/erp');
var helpers = require('./helpers');

// In this file, we test our ERP samplers by running them a bunch for various
// sample values and comparing the resulting *sample* statistics against mathematically
// derived *population* statistics. We also check that every sample is in the
// support of the distribution, so that modelers aren't bit by underflow or overflow


var product = function(arr) {
  var result = 1;
  for (var i = 0, n = arr.length; i < n; i++) {
    result *= arr[i];
  }
  return result;
}

var repeat = function(n, f) {
  // used typedarray because node can run out of memory easily with lots of big arrays
  var a = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    a[i] = f()
  }
  return a;
}

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;

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
  return sqrt(variance(a));
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
    return abs(u) <= 1 ? .75 * (1 - u * u) : 0;
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
      // reltol declares which stats we'll run for a single parameter value
      // and the acceptable relative tolerance for each

      // skip skew and kurtosis for smallest shapes because they are swayed by small (underflowy) values
      {params: [1e-4, 1e4, false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
      {params: [1e-3, 1e3, false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
      {params: [1e-2, 1e2 , false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
      {params: [1e-1, 1e1, false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
      {params: [1e0, 1e0, false], n: 5e06, skip: ['mode']},
      {params: [3e0, 9e0, false], n: 5e06, reltol: {mode: 0.1}},
      {params: [3e2, 2e2, false], n: 5e06, reltol: {mode: 0.1}},
      {params: [1e5, 3e1, false], n: 5e06, reltol: {mode: 0.1}}

      // // disable giveLog tests for now because i don't know how to compute moments
      // {params: [1e-4, 1e4, true], n: 5e05, skip: ['mode','skew','kurtosis']},
      // {params: [1e-3, 1e3, true], n: 5e05, skip: ['mode','skew','kurtosis']},
      // {params: [1e-2, 1e2 , true], n: 5e05, skip: ['mode','skew','kurtosis']},
      // {params: [1e-1, 1e1, true], n: 5e05, skip: ['mode','skew','kurtosis']},
      // {params: [1e0, 1e0, true], n: 5e05, skip: ['mode', 'skew','kurtosis']}, // kurtosis is finicky
      // {params: [3e0, 9e0, true], n: 5e05, reltol: {mode: 0.1}, skip: ['skew','kurtosis']},
      // {params: [3e2, 2e2, true], n: 5e05, reltol: {mode: 0.1}, skip: ['skew','kurtosis']},
      // {params: [1e5, 3e1, true], n: 5e05, reltol: {mode: 0.1}, skip: ['skew','kurtosis']}

    ],
    moment: function(params, n) {
      // returns the nth moment
      var shape = params[0];
      var scale = params[1];
      // HT
      // http://ocw.mit.edu/courses/mathematics/
      // 18-443-statistics-for-applications-fall-2006/lecture-notes/lecture6.pdf
      // (but NB: they use shape, rate whereas we have shape, scale)
      return product(_.range(0, n - 1).map(function(k) { return shape + k })) * pow(scale, n)
    },
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

        assert(shape > 1, 'gamma mode called with shape <= 1')
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
        var giveLog = params[2];

        if (giveLog) {
          throw new Error('gamma skew not implemented for log samples');
        } else {
          return 2 / sqrt(shape);
        }
      },
      kurtosis: function(params) {
        var shape = params[0];
        var giveLog = params[2];

        if (giveLog) {
          throw new Error('gamma kurtosis not implemented for log samples');
        } else {
          return 3 + 6 / shape;
        }
      }
    }
  }
];


var generateSettingTest = function(seed, erpMetadata, settings) {
  // settings includes:
  // - params to the erp
  // - inference params (e.g., number of samples)
  // - test params (e.g., relative tolerance)
  var params = settings.params;
  var n = settings.n;
  var samples;


  var group = {};

  group.setUp = function(callback) {
    util.seedRNG(seed);
    if (!samples) {
      samples = repeat(n, function() {
        return erpMetadata.sampler(params);
      })
    }
    callback();
  };

  group.tearDown = function(callback) {
    util.resetRNG();
    callback();
  };

  // check that every sample is in the support of the distribution
  var inSupport = erpMetadata.inSupport;
  group['support'] = function(test) {
    // do it with a for loop because some nodes don't define map()
    // for Float64Array
    var allInSupport = true;
    for (var i = 0, ii = samples.length; ii < n; i++) {
      allInSupport = allInSupport && inSupport(params, samples[i]);
    }

    test.ok(allInSupport);
    test.done();
  }

  // only test the stats that aren't blacklisted
  var populationStatisticFunctions = _.pick(erpMetadata.populationStatisticFunctions,
                                            function(v, k) {
                                              return !_.contains(settings.skip, k)
                                            });

  var moment = erpMetadata.moment;

  _.each(populationStatisticFunctions, function(statFn, statName) {
    var expectedResult = statFn(params);

    // compute an automatic tolerance for mean, variance, skew, kurtosis
    var autoTolerance;

    var variance = populationStatisticFunctions.variance(params)
    var sigma = sqrt(variance);

    var samplingDistVariance;

    if (statName == 'mean') {
      samplingDistVariance = variance / n;
    }

    if (statName == 'variance') {
      // sample variance is asymptotically normally distributed
      // http://stats.stackexchange.com/questions/105337/asymptotic-distribution-of-sample-variance-of-non-normal-sample
      samplingDistVariance = moment(params, 4) / n - pow(sigma, 4) * (n - 3) / (n * (n - 1));
    }

    if (statName == 'skew') {
      // HT https://en.wikipedia.org/wiki/Skewness#Sample_skewness
      // formula assumes normal distribution
      // thankfully, van der Vaart tells us that sample skew is asymptotically
      // normally distributed (page 29 of Asymptotic Statistics)
      samplingDistVariance = 6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3));
    }

    if (statName == 'kurtosis') {
      // HT https://en.wikipedia.org/wiki/Kurtosis#Sample_kurtosis
      samplingDistVariance = 24 * n * (n - 1) * (n - 1) / ((n - 3) * (n - 2) * (n + 3) * (n + 5))
    }

    // we want tests to fail with probability 1/10000
    // (succeed with probability 0.9999)
    // set the error tolerance to be 4 sd's;
    // 0.999367 of the probability mass of a normal distribution lies within
    // 4 standard deviations.
    // but the sampling distributions are only asymptotically normal
    // so let's give them some breathing room
    var autoToleranceMultiple = {
      mean: 8,
      variance: 8,
      skew: 400,
      kurtosis: 400
    };
    autoTolerance = autoToleranceMultiple[statName] * sqrt(samplingDistVariance);

    group[statName] = function(test) {
      var sampleStatisticFunction = sampleStatisticFunctions[statName];
      var actualResult = sampleStatisticFunction(samples);

      var tolerance;
      if (settings.reltol && settings.reltol[statName]) {
        tolerance = abs(settings.reltol[statName] * expectedResult);
      } else {
        tolerance = autoTolerance
      }

      helpers.testWithinTolerance(test,
                                  actualResult,
                                  expectedResult,
                                  tolerance,
                                  statName,
                                  'verbose'
      );
      test.done();
    }
  });

  return group;
}

var generateTestCases = function(seed) {
  var oldSuppressWarnings = !!global.suppressWarnings;
  var oldStackTraceLimit = Error.stackTraceLimit;

  exports.setUp = function(callback) {
    // suppress warnings (for, e.g., underflow)
    global.suppressWarnings = true;

    // less noise from stack trace
    Error.stackTraceLimit = 2;
    callback()
  }

  exports.tearDown = function(callback) {
    global.suppressWarnings = oldSuppressWarnings;
    Error.stackTraceLimit = oldStackTraceLimit;
    callback()
  }

  _.each(erpMetadataList, function(erpMetadata) {
    var group = {};

    _.map(erpMetadata.settings, function(settings) {
      group[settings.params.join(',')] = generateSettingTest(seed, erpMetadata, settings)
    });

    exports[erpMetadata.name] = group;
  });

};



function getRandomSeedFromEnv() {
  if (process.env.RANDOM_SEED) {
    var seed = parseInt(process.env.RANDOM_SEED);
    util.assertValidRandomSeed(seed);
    return seed;
  }
}

var seed = getRandomSeedFromEnv() || abs(seedrandom().int32());
console.log('Random seed: ' + seed);
generateTestCases(seed);
