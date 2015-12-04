'use strict';

Error.stackTraceLimit = 0;

var _ = require('underscore');
var seedrandom = require('seedrandom');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util');
var webppl = require('../src/main');
var erp = require('../src/erp');
var helpers = require('./helpers');

var EM = 0.57721566490153286060651209008240243104215933593992;

var repeat = function(n,f) {
  // used typedarray because node can run out of memory easily
  // with lots of big arrays

  var a = new Float64Array(n);

  for(var i = 0; i < n; i++) {
    a[i] = f()
  }
  return a;
}

// cache sample statistics by attaching
// properties to the sample array
// e.g., a._mean, a._sd,
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
  for(var i = 0; i < n; i++) {
    sum += a[i];
  }
  return sum/n;
};
var mean = cache(_mean);

function _variance(a) {
  var n = a.length;
  var m = mean(a);
  var sum = 0;

  for(var i = 0; i < n; i++) {
    var v = a[i]-m;
    sum += v*v;
  }

  return sum / n;
};
var variance = cache(_variance);

function _sd(a) {
  return Math.sqrt(variance(a));
};
var sd = cache(_sd);

function _skew(a) {
  var n = a.length;
  var m = mean(a);
  var s = sd(a);
  var sum = 0;

  for(var i = 0; i < n; i++) {
    var v = a[i]-m;
    sum += Math.pow(v,3);
  }

  sum = sum / (Math.pow(s,3));

  return sum/n;
};
var skew = (_skew);

function _kurtosis(a) {
  var n = a.length;
  var m = mean(a);
  var s = sd(a);
  var sum = 0;

  for(var i = 0; i < n; i++) {
    var v = a[i]-m;
    sum += Math.pow(v,4);
  }

  sum = sum / (Math.pow(s,4));

  return sum/n;
};
var kurtosis = (_kurtosis);

function kdeMode(samps) {
  var kernel = function(u) {
    return Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
  };

  // get optimal bandwidth
  // HT http://en.wikipedia.org/wiki/Kernel_density_estimation#Practical_estimation_of_the_bandwidth
  var n = samps.length;
  var s = sd(samps);

  var bandwidth = 1.06 * s * Math.pow(n, -0.2);

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


// compute half-sample mode of bickel & fruewith
// http://arxiv.org/abs/math/0505419
// assumes a is sorted
function hsm(a) {

  while(a.length > 3) {
    var n = a.length;
    var N = Math.ceil(n/2);
    var minWidth = a[n-1] - a[0];

    var j;

    for(var i = 0; i <= n - N; i++) {
      var width = a[i+N-1] - a[i];
      if (width < minWidth) {
        minWidth = width;
        j = i
      }
    }

    a = a.slice(j,j+N-1);
  }

  if (a.length == 1) {
    return a[0];
  }
  if (a.length == 2) {
    return (a[0] + a[1])/2
  }
  if (a.length == 3) {
    if (a[1] - a[0] < a[2] - a[1]) {
      return (a[0] + a[1])/2
    } else if (a[0] - a[0] > a[2] - a[1]) {
      return (a[1] + a[2])/2
    } else {
      return a[1]
    }
  }

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

global.suppressWarnings = true;

var ln = Math.log,
    pow = Math.pow;

// HT https://en.wikipedia.org/wiki/Digamma_function#Computation_and_approximation
var digamma = function(x) {
  if (x < 6)
    return digamma(x + 1) - 1/x;

  return ln(x)
    - 1/(2   * x)
    - 1/(12  * pow(x,2))
    + 1/(120 * pow(x,4))
    - 1/(252 * pow(x,6))
    + 1/(240 * pow(x,8))
    - 5/(660 * pow(x,10))
    + 691/(32760 * pow(x,12))
    - 1/(12 * pow(x,14));
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
     {params: [0.001,1/0.001], n: 6e6, reltol: 0.1, skip: ['mode']},
     {params: [0.001,1/0.001, true], n: 6e6, reltol: 0.1, skip: ['mode', 'variance', 'skew', 'kurtosis']},
     // {params: [0.01,1/0.01],   n: 1e6, reltol: 0.1, skip: ['mode']},
     // {params: [0.1,1/0.1],     n: 1e6, reltol: 0.1, skip: ['mode']},
     // {params: [1,1],           n: 1e6, reltol: 0.1, skip: ['mode']},
     // {params: [3,9],           n: 1e6, reltol: 0.05},
     // {params: [300, 200],      n: 1e6, reltol: 0.05}
     {params: [1.5,1.2,true], n:1e6, reltol: 0.1, skip: ['variance','kurtosis','skew']}
   ],
   populationStatisticFunctions: {
     mean: function(params) {
       var shape = params[0];
       var scale = params[1];
       var giveLog = params[2] ;

       return giveLog ? digamma(shape) + Math.log(scale)
         : shape * scale;
     },
     mode: function(params) {
       var shape = params[0];
       var scale = params[1];
       var giveLog = params[2];

       // for shape > 1
       if (giveLog) {
         // TODO: double check
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

       return giveLog ? trigamma(shape)
         : shape * scale * scale;
     },
     skew: function(params) {
       var shape = params[0];
       var scale = params[1];
       var giveLog = params[2];

       return 2 / Math.sqrt(shape);
     },
     kurtosis: function(params) {
       var shape = params[0];
       var scale = params[1];
       var giveLog = params[2];

       return 3 + 6/shape;
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
    test.ok( _.every(samples.map(function(x) { return inSupport(params, x) })) );
    test.done();
  }

  var includedStats = _.omit(erpMetadata.populationStatisticFunctions,
                             function(v,k) {
                               return _.contains(settings.skip, k)
                             });

  _.each(includedStats, function(statFn, statName) {
    var expectedResult = statFn(params);
    var testId = testIdPrefix + statName;

    exports[testId] = function(test) {
      var sampleStatisticFunction = sampleStatisticFunctions[statName];
      var actualResult = sampleStatisticFunction(samples);
      helpers.testWithinTolerance(test, actualResult, expectedResult, Math.abs(settings.reltol * expectedResult), statName);
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
