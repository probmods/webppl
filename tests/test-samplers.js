// In this file, we test our samplers by running them a bunch for various
// sample values and comparing the resulting *sample* statistics against mathematically
// derived *population* statistics. We also check that every sample is in the
// support of the distribution, so that users aren't bit by underflow or overflow

'use strict';

var _ = require('underscore');
var seedrandom = require('seedrandom');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var helpers = require('./helpers');
var statistics = require('../src/statistics');

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

var mean = statistics.mean;
var variance = statistics.variance;
var sd = statistics.sd;
var skew = statistics.skew;
var kurtosis = statistics.kurtosis;
var mode = statistics.kdeMode;

var sampleStatisticFunctions = {
  mean: mean,
  variance: variance,
  skew: skew,
  kurtosis: kurtosis,
  mode: mode
}

var distMetadataList = [
  require('./test-data/sampler/gamma')
];

var generateSettingTest = function(seed, distMetadata, settings) {
  // settings includes:
  // - params to the dist
  // - inference params (e.g., number of samples)
  // - test params (e.g., relative tolerance)
  var params = settings.params;
  var n = settings.n;

  // only test the stats that aren't blacklisted
  var populationStatisticFunctions = _.pick(distMetadata.populationStatisticFunctions,
                                            function(v, k) {
                                              return !_.contains(settings.skip, k)
                                            });
  var group = {};

  var moment = distMetadata.moment;

  group['test'] = function(test) {
    var samples = repeat(n, function() {
      return distMetadata.sampler.apply(null, params);
    });

    // first check support
    // use for loop because some nodes don't define map()
    // for Float64Array
    var allInSupport = true;
    for (var i = 0, ii = samples.length; i < ii; i++) {
      allInSupport = allInSupport && distMetadata.inSupport(params, samples[i]);
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
        skew: 100,
        kurtosis: 100
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

  group.setUp = function(callback) {
    util.seedRNG(seed);
    callback();
  };

  group.tearDown = function(callback) {
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

  _.each(distMetadataList, function(distMetadata) {
    var group = {};

    _.map(distMetadata.settings, function(settings) {
      group[settings.params.join(',')] = generateSettingTest(seed, distMetadata, settings)
    });

    exports[distMetadata.name] = group;
  });

};

var seed = helpers.getRandomSeedFromEnv() || abs(seedrandom().int32());
console.log('Random seed: ' + seed);
generateTestCases(seed);
