"use strict";

var fs = require('fs');
var util = require("../src/util.js");
var webppl = require('../src/main.js');
var testCase = require('nodeunit').testCase;

var topK;
var _trampoline;

function runContinuousSamplingTest(test, code, checkSamples, numSamples){
  var samples = [];
  topK = function(s, value){
    _trampoline = null;
    samples.push(value);
    if (samples.length === numSamples){
      test.ok(checkSamples(samples));
      test.done();
    }
  };
  var compiledProgram = webppl.compile(code);
  for (var i=0; i<numSamples; i++){
    eval('(function(){' + compiledProgram + '})()');
  }
}

function runDiscreteSamplingTest(test, code, expectedHist, numSamples, tolerance){
  var hist = {};
  var numFinishedSamples = 0;
  topK = function(s, value){
    _trampoline = null;
    hist[value] = hist[value] || 0;
    hist[value] += 1;
    numFinishedSamples += 1;
    if (numFinishedSamples === numSamples){
      var normHist = util.normalizeHist(hist);
      test.ok(util.histsApproximatelyEqual(normHist, expectedHist, tolerance));
      test.done();
    }
  };
  var compiledProgram = webppl.compile(code);
  for (var i=0; i<numSamples; i++){
    eval('(function(){' + compiledProgram + '})()');
  }
}

function runDistributionTest(test, code, expectedHist, tolerance){
  var hist = {};
  topK = function(s,erp){
    _trampoline = null;
    erp.support().forEach(
      function (value){
        hist[value] = Math.exp(erp.score([], value));
      });
    var normHist = util.normalizeHist(hist);
    test.ok(util.histsApproximatelyEqual(normHist, expectedHist, tolerance));
    test.done();
  };
  webppl.run(code, topK);
}

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
      1: 0.25,
      0: 0.75
    };
    var tolerance = 0.05;
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
    var tolerance = 0.05;
    var numSamples = 1000;
    return runDiscreteSamplingTest(test, code, expectedHist, numSamples, tolerance);
  },

  testRandomInteger: function(test) {
    var code = "randomInteger(5)";
    var expectedHist= {
      0: 0.2,
      1: 0.2,
      2: 0.2,
      3: 0.2,
      4: 0.2
    };
    var tolerance = 0.05;
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
      return ((Math.abs(empiricalVariance - expectedVariance) < 0.2) &&
              (Math.abs(empiricalMean - expectedMean) < 0.2));
    };
    return runContinuousSamplingTest(test, code, check, numSamples);
  }
};

function getTestCases(testNames) {
	var rootDirectory = "./tests/test-data/";
	var testCases = [];
	for (var i = 0; i < testNames.length; i++) {
		var codeFileName = rootDirectory + testNames[i] + ".wppl";
		var resultFileName = rootDirectory + testNames[i] + ".json";
		var codeFile = fs.readFileSync(codeFileName, "utf-8");
		var expectedResult = JSON.parse(fs.readFileSync(resultFileName, "utf-8"));
		testCases.push({
			code: codeFile,
			expectedHist: expectedResult.expectedHist,
			tolerance: expectedResult.tolerance,
			name: testNames[i]
		});
	}
	return testCases;
}

function makeTest(testData) {
	function _makeTest (test) {
		runDistributionTest(test, testData.code, testData.expectedHist, testData.tolerance);
	}
	return _makeTest;
}

var testNames = [
	"testEnumeration",
	"testEnumerationCached",
	"testParticleFilter",
	"testMH",
	"testPMCMC",
	"testPFRj"];

var testsData = getTestCases(testNames);

for (var i=0; i < testsData.length; i++) {
	var testData = testsData[i];
	var description = testData.desc ? testData.desc : "test";
	var testCaseArgs = {};
	testCaseArgs[description] = makeTest(testData);
	exports[testData.name] = testCase(testCaseArgs);
}