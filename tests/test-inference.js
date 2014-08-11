"use strict";

var util = require("../src/util.js");
var _ = require('underscore');
var webppl = require('../src/main.js');
var topK = webppl.topK;

var testHistsApproxEqual = function(test, hist, expectedHist, tolerance){
  var allOk = true;
  _.each(expectedHist,
         function(expectedValue, key){
           var value = hist[key] || 0;
           var testPassed = Math.abs(value - expectedValue) <= tolerance;
           test.ok(testPassed);
           allOk = allOk && testPassed;
         });
  if (!allOk){
    console.log("Expected:", expectedHist);
    console.log("Actual:", hist);
  }
};

var runSamplingTest = function(test, code, expectedHist, numSamples, tolerance){
  var hist = {};
  topK = function(value){
        hist[value] = hist[value] || 0;
        hist[value] += 1;
  };
  var compiledProgram = webppl.compile(code);
  for (var i=0; i<numSamples; i++){
    eval(compiledProgram);
  }
  var normHist = util.normalize(hist);
  testHistsApproxEqual(test, normHist, expectedHist, tolerance);
  test.done();
};

var runDistributionTest = function(test, code, expectedHist, tolerance){
  var hist = {};
  topK = function(erp){
    _.each(
      erp.support(),
      function (value){
        hist[value] = Math.exp(erp.score([], value));
      });
  };
  webppl.run(code, topK);
  var normHist = util.normalize(hist);
  testHistsApproxEqual(test, normHist, expectedHist, tolerance);
  test.done();
};

exports.testDeterministic = {
  testApplication: function (test) {
    var code = "plus(3, 4)";
    var expectedHist = {7: 1};
    var tolerance = 0.0001; // in case of floating point errors
    return runSamplingTest(test, code, expectedHist, 1, tolerance);
  }
};

exports.testForwardSampling = {

  testApplication: function (test) {
    var code = "and(flip(.5), flip(.5))";
    var expectedHist = {
      "true": .25,
      "false": .75
    };
    var tolerance = .05;
    var numSamples = 1000;
    return runSamplingTest(test, code, expectedHist, numSamples, tolerance);
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
    return runSamplingTest(test, code, expectedHist, numSamples, tolerance);
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
    return runSamplingTest(test, code, expectedHist, numSamples, tolerance);
  }
};

exports.testEnumeration = {
  test1: function(test){
    var code = ("var e = cache(function (x){" +
                "    return Enumerate(function() {" +
                "                     var a = and(flip(0.5),flip(0.5));" +
                "                     factor(a? 2 : callPrimitive(Math.log, 0.3));" +
                "                     return and(a,x);" +
                "                     });});" +
                "" +
                "Enumerate(function(){" +
                "          var e1 = sample(e(true));" +
                "          var e2 = sample(e(true));" +
                "            return and(e1,e2);" +
                "          });");
    // TODO: Check that the expected hist is correct
    var expectedHist = {
      "true": 0.8914231018274679,
      "false": 0.10857689817253217
    };
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
                "    factor(or(x, y) ? 0 : -Infinity);" +
                "    return x;" +
                "  }," +
                "  300) // particles");
    var expectedHist = {
      "true": 2/3,
      "false": 1/3
    };
    var tolerance = .1;
    runDistributionTest(test, code, expectedHist, tolerance);
  }
};
