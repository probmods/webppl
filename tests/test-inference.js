"use strict";

var util = require("../src/util.js");
var _ = require('underscore');
var webppl = require('../src/main.js');

var topK;
var _trampoline;

function runContinuousSamplingTest(test, code, checkSamples, numSamples){
  var samples = [];
  topK = function(s, value){
    _trampoline = null;
    samples.push(value);
    if (samples.length == numSamples){
      test.ok(checkSamples(samples));
      test.done();
    }
  };
  var compiledProgram = webppl.compile(code);
  for (var i=0; i<numSamples; i++){
    eval('(function(){' + compiledProgram + '})()');
  }
};

function runDiscreteSamplingTest(test, code, expectedHist, numSamples, tolerance){
  var hist = {};
  var numFinishedSamples = 0;
  topK = function(s, value){
    _trampoline = null;
    hist[value] = hist[value] || 0;
    hist[value] += 1;
    numFinishedSamples += 1;
    if (numFinishedSamples == numSamples){
      var normHist = util.normalizeHist(hist);
      test.ok(util.histsApproximatelyEqual(normHist, expectedHist, tolerance));
      test.done();
    }
  };
  var compiledProgram = webppl.compile(code);
  for (var i=0; i<numSamples; i++){
    eval('(function(){' + compiledProgram + '})()');
  }
};

function runDistributionTest(test, code, expectedHist, tolerance){
  var hist = {};
  topK = function(s,erp){
    _trampoline = null;
    _.each(
      erp.support(),
      function (value){
        hist[value] = Math.exp(erp.score([], value));
      });
    var normHist = util.normalizeHist(hist);
    test.ok(util.histsApproximatelyEqual(normHist, expectedHist, tolerance));
    test.done();
  };
  webppl.run(code, topK);
};

exports.testDeterministic = {

  testApplication: function (test) {
    var code = "3 + 4";
    var expectedHist = {7: 1};
    var tolerance = 0.0001; // in case of floating point errors
    return runDiscreteSamplingTest(test, code, expectedHist, 1, tolerance);
  }

};

exports.testForwardSampling = {

  testApplication: function (test) {
    var code = "flip(.5) & flip(.5)";
    var expectedHist = {
      1: .25,
      0: .75
    };
    var tolerance = .05;
    var numSamples = 1000;
    return runDiscreteSamplingTest(test, code, expectedHist, numSamples, tolerance);
  },

  testGeometric: function(test) {
    var code = "var geom = function() { return flip(.8) ? 0 : 1 + geom() }; geom()";
    var expectedHist= {
      0: 0.8,
      1: 0.16,
      2: 0.032,
      3: 0.0064,
      4: 0.00128
    };
    var tolerance = .05;
    var numSamples = 1000;
    return runDiscreteSamplingTest(test, code, expectedHist, numSamples, tolerance);
  },

  testRandomInteger: function(test) {
    var code = "randomInteger(5)";
    var expectedHist= {
      0: .2,
      1: .2,
      2: .2,
      3: .2,
      4: .2
    };
    var tolerance = .05;
    var numSamples = 1000;
    return runDiscreteSamplingTest(test, code, expectedHist, numSamples, tolerance);
  },

  testGaussian: function(test){
    var code = "gaussian(3, 2)";
    var numSamples = 10000;
    var check = function(samples){
      var empiricalMean = util.sum(samples) / samples.length;
      var empiricalVariance = util.sum(
        samples.map(function(x){return Math.pow(x - empiricalMean, 2);})) / samples.length;
      var empiricalStd = Math.sqrt(empiricalVariance);
      return ((empiricalMean > 2.8) && (empiricalMean < 3.2) &&
              (empiricalStd > 1.8) && (empiricalStd < 2.2));
    };
    return runContinuousSamplingTest(test, code, check, numSamples);
  },

  testUniform: function(test){
    var code = "uniform(3, 5)";
    var numSamples = 10000;
    var check = function(samples){
      var empiricalMean = util.sum(samples) / samples.length;
      var empiricalVariance = util.sum(
        samples.map(function(x){return Math.pow(x - empiricalMean, 2);})) / samples.length;
      var expectedVariance = 1/12 * Math.pow(5-3, 2);
      var expectedMean = 4;
      return ((Math.abs(empiricalVariance - expectedVariance) < .2) &&
              (Math.abs(empiricalMean - expectedMean) < .2));
    };
    return runContinuousSamplingTest(test, code, check, numSamples);
  }
};

exports.testEnumeration = {
  test1: function(test){
    var code = ("Enumerate(" +
                "  function(){" +
                "    var x = flip(0.5);" +
                "    var y = flip(0.5);" +
                "    factor( (x|y) ? 0 : -Infinity);" +
                "    return x;" +
                "  }," +
                "  300) // particles");
    var expectedHist = {
      "true": 2/3,
      "false": 1/3
    };
    var tolerance = .1;
    runDistributionTest(test, code, expectedHist, tolerance);
  },

  test2: function(test){
    var code = ("var e = cache(function (x){" +
                "    return Enumerate(function() {" +
                "                     var a = flip(0.5) & flip(0.5);" +
                "                     factor(a? 2 : Math.log(0.3));" +
                "                     return a & x;" +
                "                     });});" +
                "" +
                "Enumerate(function(){" +
                "            var e1 = sample(e(true));" +
                "            var e2 = sample(e(true));" +
                "            return e1 & e2;" +
                "          });");
    // TODO: Check that the expected hist is correct
    var expectedHist = { '0': 0.2053648535282959, '1': 0.794635146471704 };
    var tolerance = .0001;
    runDistributionTest(test, code, expectedHist, tolerance);
  }
};

exports.testParticleFilter = {
  test1: function(test){
    var code = ("ParticleFilter(" +
                "  function(){" +
                "    var x = flip(0.5);" +
                "    var y = flip(0.5);" +
                "    factor( (x|y) ? 0 : -Infinity);" +
                "    return x;" +
                "  }," +
                "  1000) // particles");
    var expectedHist = {
      "true": 2/3,
      "false": 1/3
    };
    var tolerance = .1;
    runDistributionTest(test, code, expectedHist, tolerance);
  }
};

exports.testMH = {
  test1: function(test){
    var code = ("MH(" +
                "  function(){" +
                "    var x = flip(0.5);" +
                "    var y = flip(0.5);" +
                "    factor( (x|y) ? 0 : -Infinity);" +
                "    return x;" +
                "  }," +
                "  5000) // samples");
    var expectedHist = {
      "true": 2/3,
      "false": 1/3
    };
    var tolerance = .1;
    runDistributionTest(test, code, expectedHist, tolerance);
  }
};

exports.testPMCMC = {
  test1: function(test){
    var code = ("PMCMC(" +
                "  function(){" +
                "    var x = flip(0.5);" +
                "    var y = flip(0.5);" +
                "    factor( (x|y) ? 0 : -Infinity);" +
                "    return x;" +
                "  }," +
                "  1000, 5) // particles");
    var expectedHist = {
      "true": 2/3,
      "false": 1/3
    };
    var tolerance = .1;
    runDistributionTest(test, code, expectedHist, tolerance);
  }
};

exports.testPFRj = {
  test1: function(test){
    var code = ("ParticleFilterRejuv(" +
                "  function(){" +
                "    var x = flip(0.5);" +
                "    var y = flip(0.5);" +
                "    factor( (x|y) ? 0 : -Infinity);" +
                "    return x;" +
                "  }," +
                "  1000, 10) // particles, rejuvenation steps");
    var expectedHist = {
      "true": 2/3,
      "false": 1/3
    };
    var tolerance = .1;
    runDistributionTest(test, code, expectedHist, tolerance);
  }
};
