'use strict';

var _ = require('underscore');
var seedrandom = require('seedrandom');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var erp = require('../src/erp');
var helpers = require('./helpers');
var statistics = require('../src/statistics');

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

var mean = cache(statistics.mean);

// performant timings: 49660ms, 49529ms

// probably don't need to cache variance
var variance = cache(statistics.variance);
var sd = cache(statistics.sd);
var skew = statistics.skew;
var kurtosis = statistics.kurtosis;

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


var erpMetadataList = [
  require('./test-data/erp/gamma')
];


var generateSettingTest = function(seed, erpMetadata, settings) {
  // settings includes:
  // - params to the erp
  // - inference params (e.g., number of samples)
  // - test params (e.g., relative tolerance)
  var params = settings.params;
  var n = settings.n;

  // only test the stats that aren't blacklisted
  var populationStatisticFunctions = _.pick(erpMetadata.populationStatisticFunctions,
                                            function(v, k) {
                                              return !_.contains(settings.skip, k)
                                            });

  var group = {};

  var moment = erpMetadata.moment;

  group['test'] = function(test) {
    var samples = repeat(n, function() {
      return erpMetadata.sampler(params);
    });

    // first check support
    // use for loop because some nodes don't define map()
    // for Float64Array
    var allInSupport = true;
    for (var i = 0, ii = samples.length; i < ii; i++) {
      allInSupport = allInSupport && erpMetadata.inSupport(params, samples[i]);
    }

    test.ok(allInSupport);

    // then check each populationStatisticFunction
    _.each(populationStatisticFunctions, function(statFn, statName) {
      var expectedResult = statFn(params);

      // compute an automatic tolerance for mean, variance, skew, kurtosis
      var autoTolerance;

      var variance = populationStatisticFunctions.variance(params)
      var sigma = sqrt(variance);

      var samplingDistVariance;

      if (statName == 'mean') {
        samplingDistVariance = variance / n;
      } else if (statName == 'variance') {
        // sample variance is asymptotically normally distributed
        // http://stats.stackexchange.com/a/105338/71884
        samplingDistVariance = moment(params, 4) / n - pow(sigma, 4) * (n - 3) / (n * (n - 1));
      } else if (statName == 'skew') {
        // HT https://en.wikipedia.org/wiki/Skewness#Sample_skewness
        // formula assumes normal distribution
        // thankfully, van der Vaart tells us that sample skew is asymptotically
        // normally distributed (page 29 of Asymptotic Statistics)
        samplingDistVariance = 6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3));
      } else if (statName == 'kurtosis') {
        // HT https://en.wikipedia.org/wiki/Kurtosis#Sample_kurtosis
        samplingDistVariance = 24 * n * (n - 1) * (n - 1) / ((n - 3) * (n - 2) * (n + 3) * (n + 5))
      }

      // we want tests to fail with probability 1/10000 (succeed with probability 0.9999)
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
                                  'verbose');
    });

    test.done();

  };

  var numTestsLeft = _.size(_.omit(group, 'setUp', 'tearDown'));

  group.setUp = function(callback) {
    util.seedRNG(seed);
    callback();
  };

  group.tearDown = function(callback) {
    numTestsLeft--;
    util.resetRNG();
    callback();
  };


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

var seed = helpers.getRandomSeedFromEnv() || abs(seedrandom().int32());
console.log('Random seed: ' + seed);
generateTestCases(seed);
