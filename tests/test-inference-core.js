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
    store: { hist: { tol: 0 } }
  },
  {
    name: 'MH',
    args: [5000],
    only: ['simple', 'store', 'binomial', 'geometric', 'drift'],
    hist: { tol: 0.1 },
    store: { hist: { tol: 0 }, args: [100] },
    drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [100000, 20000] }
  },
  {
    name: 'PMCMC',
    args: [1000, 5],
    only: ['simple', 'store'],
    hist: { tol: 0.1 },
    store: { hist: { tol: 0 }, args: [30, 30] }
  },
  {
    name: 'PFRj',
    func: 'ParticleFilterRejuv',
    args: [1000, 10],
    only: ['simple', 'store', 'binomial', 'geometric', 'drift'],
    hist: { tol: 0.1 },
    store: { hist: { tol: 0 }, args: [30, 30] },
    drift: { mean: { tol: 0.3 }, std: { tol: 0.3 }, args: [1000, 15] }
  },
  {
    name: 'PFRjAsMH',
    func: 'ParticleFilterRejuv',
    args: [1, 10000],
    only: ['simple'],
    hist: { tol: 0.1 }
  },
  {
    name: 'AsyncPF',
    args: [1000, 1000],
    only: ['simple', 'store'],
    hist: { tol: 0.1 },
    store: { hist: { tol: 0 }, args: [100, 100] }
  },
  {
    name: 'ParticleFilter',
    args: [1000],
    only: ['simple', 'store', 'varFactors1', 'varFactors2'],
    hist: { tol: 0.1 },
    store: { hist: { tol: 0 }, args: [100] },
    varFactors1: { args: [5000] }
  }
];

var performTest = function(modelName, testDef, test) {
  var expectedResults = loadExpected(modelName);
  var inferenceFunc = testDef.func || testDef.name;
  var inferenceArgs = getInferenceArgs(testDef, modelName);
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
        var testArgs = _.extendOwn.apply(null, _.filter([
          { tol: 0.0001 }, // Defaults.
          testDef[testName],
          testDef[modelName] && testDef[modelName][testName] // Most specific.
        ]));
        //console.log('\t' + testName);
        //console.log('\t' + JSON.stringify(testArgs));
        testFunctions[testName](test, erp, hist, expected, testArgs);
      });
    });
  } catch (e) {
    console.error('Exception: ' + e);
    throw e;
  }

  test.done();
};

var getInferenceArgs = function(testDef, model) {
  var args = (testDef[model] && testDef[model].args) || testDef.args;
  return JSON.stringify(args).slice(1, -1);
};

var testWithinTolerance = function(test, actual, expected, tolerance, name) {
  var absDiff = Math.abs(actual - expected);
  var msg = ['Expected ', name, ': ', expected, ', actual: ', actual].join('');
  test.ok(absDiff < tolerance, msg);
};

var testFunctions = {
  hist: function(test, erp, hist, expected, args) {
    test.ok(util.histsApproximatelyEqual(hist, expected, args.tol));
  },
  mean: function(test, erp, hist, expected, args) {
    testWithinTolerance(test, util.expectation(hist), expected, args.tol, 'mean');
  },
  std: function(test, erp, hist, expected, args) {
    testWithinTolerance(test, util.std(hist), expected, args.tol, 'std');
  }
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
