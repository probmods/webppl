'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util.js');
var webppl = require('../src/main.js');

var testDataDir = './tests/test-data/';

var testDefinitions = [
  {
    name: 'Enumerate',
    args: [10],
    only: ['simple', 'store', 'binomial', 'geometric', 'cache'],
    store: { tol: { hist: 0 } }
  },
  {
    name: 'MH',
    args: [5000],
    only: ['simple', 'store', 'binomial', 'geometric', 'drift'],
    tol: { hist: 0.1 },
    store: { tol: { hist: 0 }, args: [100] },
    drift: { tol: { mean: 0.3, std: 0.3 }, args: [100000, 20000] }
  },
  {
    name: 'PMCMC',
    args: [1000, 5],
    tol: { hist: 0.1 },
    only: ['simple', 'store'],
    store: { tol: { hist: 0 }, args: [30, 30] }
  },
  {
    name: 'PFRj',
    func: 'ParticleFilterRejuv',
    only: ['simple', 'store', 'binomial', 'geometric', 'drift'],
    args: [1000, 10],
    tol: { hist: 0.1 },
    store: { tol: { hist: 0 }, args: [30, 30] },
    drift: { tol: { mean: 0.3, std: 0.3 }, args: [1000, 15] }
  },
  {
    name: 'PFRjAsMH',
    func: 'ParticleFilterRejuv',
    args: [1, 10000],
    only: ['simple'],
    tol: { hist: 0.1 }
  },
  {
    name: 'AsyncPF',
    args: [1000, 1000],
    tol: { hist: 0.1 },
    only: ['simple', 'store'],
    store: { tol: { hist: 0 }, args: [100, 100] }
  },
  {
    name: 'ParticleFilter',
    args: [1000],
    tol: { hist: 0.1 },
    only: ['simple', 'store', 'varFactors1', 'varFactors2'],
    store: { tol: { hist: 0 }, args: [100] },
    varFactors1: { args: [5000] }
  }
];

var performTest = function(modelName, testDef, test) {
  var expectedResults = loadExpected(modelName);
  var inferenceFunc = testDef.func || testDef.name;
  var inferenceArgs = getArgs(testDef, modelName);
  var progText = [
    loadModel(modelName),
    inferenceFunc, '(model,', inferenceArgs, ');'
  ].join('');

  //console.log([testDef.name, modelName, inferenceArgs]);


  try {
    webppl.run(progText, function(s, erp) {
      var hist = getHist(erp);
      _.each(expectedResults, function(expected, testName) {
        // The tests to run for a particular model are determined by the contents
        // of the expected results JSON file.
        assert(testFunctions[testName], 'Unexpected key "' + testName + '"');
        var tolerance = getTolerance(testDef, modelName, testName);
        //console.log('\t', [testName, tolerance]);
        testFunctions[testName](test, hist, expected, tolerance);
      });
    });
  } catch (e) {
    console.error('Exception: ' + e);
    throw e;
  }

  test.done();
};

var getArgs = function(testDef, model) {
  var args = (testDef[model] && testDef[model].args) || testDef.args;
  return JSON.stringify(args).slice(1, -1);
};

var getTolerance = function(testDef, model, test) {
  // The tolerance used for a particular test is determined by taking the first
  // (defined) value from the following.

  // 1. testDef[model].tol[test]
  // 2. testDef.tol[test]
  // 3. defaultTol

  var defaultTol = 0.0001;
  return _.chain([
    testDef[model] && testDef[model].tol && testDef[model].tol[test],
    testDef.tol && testDef.tol[test],
    defaultTol
  ]).reject(_.isUndefined).first().value();
};

var testStatistic = function(test, statistic, name, hist, expected, tolerance) {
  var actual = statistic(hist);
  test.ok(
      Math.abs(actual - expected) < tolerance,
      ['Expected ', name, ': ', expected, ', actual: ', actual].join(''));
};

var testFunctions = {
  hist: function(test, hist, expected, tolerance) {
    test.ok(util.histsApproximatelyEqual(hist, expected, tolerance));
  },
  mean: _.partial(testStatistic, _, util.expectation, 'mean'),
  std: _.partial(testStatistic, _, util.std, 'std')
};

var getHist = function(erp) {
  var hist = {};
  erp.support().forEach(function(value) {
    hist[value] = Math.exp(erp.score([], value));
  });
  return util.normalizeHist(hist);
};

var getModelNames = function() {
  var filenames = fs.readdirSync(testDataDir + 'models2/');
  return _.map(filenames, function(fn) { return fn.split('.')[0]; });
};

var loadModel = function(modelName) {
  var filename = testDataDir + 'models2/' + modelName + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var loadExpected = function(modelName) {
  var filename = testDataDir + 'expected2/' + modelName + '.json';
  return JSON.parse(fs.readFileSync(filename, 'utf-8'));
};

var generateTestCases = function() {
  _.each(getModelNames(), function(modelName) {
    _.each(testDefinitions, function(testDef) {
      if (_.isUndefined(testDef.only) || _.includes(testDef.only, modelName)) {
        var testName = modelName + testDef.name;
        exports[testName] = _.partial(performTest, modelName, testDef);
      }
    });
  });
};

generateTestCases();
