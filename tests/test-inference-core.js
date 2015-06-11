'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util.js');
var webppl = require('../src/main.js');

var testDataDir = './tests/test-data/';

var modelNames = [
  'simple',
  'store',
  'binomial',
  'geometric',
  'drift',
  'cache',
  'varFactors1',
  'varFactors2'
];

var inferenceProcs = [
  {
    name: 'Enumerate',
    args: [10],
    skip: ['drift', 'varFactors1', 'varFactors2'],
    store: { tol: { hist: 0 } }
  },
  {
    name: 'MH',
    args: [5000],
    skip: ['cache', 'varFactors1', 'varFactors2'],
    tol: { hist: 0.1 },
    store: { tol: { hist: 0 }, args: [100] },
    drift: { tol: { mean: 0.3, std: 0.3 }, args: [100000, 20000] }
  },
  {
    name: 'PMCMC',
    args: [1000, 5],
    tol: { hist: 0.1 },
    skip: ['binomial', 'geometric', 'drift', 'cache', 'varFactors1', 'varFactors2'],
    store: { tol: { hist: 0 }, args: [30, 30] }
  },
  {
    name: 'PFRj',
    func: 'ParticleFilterRejuv',
    skip: ['cache', 'varFactors1', 'varFactors2'],
    args: [1000, 10],
    tol: { hist: 0.1 },
    store: { tol: { hist: 0 }, args: [30, 30] },
    drift: { tol: { mean: 0.3, std: 0.3 }, args: [1000, 15] }
  },
  {
    name: 'PFRjAsMH',
    func: 'ParticleFilterRejuv',
    args: [1, 10000],
    skip: ['store', 'binomial', 'geometric', 'drift', 'cache', 'varFactors1', 'varFactors2'],
    tol: { hist: 0.1 },
  },
  {
    name: 'AsyncPF',
    args: [1000, 1000],
    tol: { hist: 0.1 },
    skip: ['binomial', 'geometric', 'drift', 'cache', 'varFactors1', 'varFactors2'],
    store: { tol: { hist: 0 }, args: [100, 100] }
  },
  {
    name: 'ParticleFilter',
    args: [1000],
    tol: { hist: 0.1 },
    skip: ['binomial', 'geometric', 'drift', 'cache'],
    store: { tol: { hist: 0 }, args: [100] },
    varFactors1: { args: [5000] }
  }
];

var performTests = function (modelName, proc, test) {

  var allExpected = loadExpected(modelName);

  var inferenceFunc = proc.func || proc.name;
  var inferenceArgs = getArgs(proc, modelName);

  var progText = [
    loadModel(modelName),
    inferenceFunc, '(model,', inferenceArgs, ');'
  ].join('');

  //console.log([inferenceProc.name, modelName, inferenceArgs]);

  webppl.run(progText, function (s, erp) {
    var hist = getHist(erp);
    _.each(allExpected, function (expected, testName) {
      // The tests to run for a particular model are determined by the contents
      // of the expected results JSON file.
      assert(tests[testName], 'Unexpected key "' + testName + '"');
      var tolerance = getTolerance(proc, modelName, testName);
      tests[testName](hist, expected, test, tolerance);
    });
  });

  test.done();
};

var getArgs = function (proc, model) {
  var args = (proc[model] && proc[model].args) || proc.args;
  return JSON.stringify(args).slice(1, -1);
};

var getTolerance = function (proc, model, test) {
  // The tolerance used for a particular test is determined by taking the first
  // defined value from the following.
  //
  // 1. infProc[model].tol[test]
  // 2. infProc.tol[test]
  // 3. defaultTol

  var defaultTol = 0.0001;
  var val = _.chain([
    proc[model] && proc[model].tol && proc[model].tol[test],
    proc.tol && proc.tol[test],
    defaultTol
  ]).reject(_.isUndefined).first().value();
  //console.log([proc.name, model, test, val]);
  return val;
};

var testStatistic = function (statistic, name, hist, expected, test, tolerance) {
  var actual = statistic(hist);
  test.ok(
    Math.abs(actual - expected) < tolerance,
    ['Expected ', name, ': ', expected, ', actual: ', actual].join(''));
};

var tests = {
  hist: function (hist, expected, test, tolerance) {
    test.ok(util.histsApproximatelyEqual(hist, expected, tolerance));
  },
  mean: _.partial(testStatistic, util.expectation, 'mean'),
  std: _.partial(testStatistic, util.std, 'std')
};

var getHist = function (erp) {
  var hist = {};
  erp.support().forEach(function(value) {
    hist[value] = Math.exp(erp.score([], value));
  });
  return util.normalizeHist(hist);
};

var loadModel = function (modelName) {
  var filename = testDataDir + 'models2/' + modelName + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var loadExpected = function (modelName) {
  var filename = testDataDir + 'expected2/' + modelName + '.json';
  return JSON.parse(fs.readFileSync(filename, 'utf-8'));
};

var generateTestCases = function () {
  _.each(modelNames, function (modelName) {
    _.each(inferenceProcs, function (inferenceProc) {
      if (!_.includes(inferenceProc.skip, modelName)) {
        var testName = modelName + inferenceProc.name;
        exports[testName] = _.partial(performTests, modelName, inferenceProc);
      }
    });
  });
};

generateTestCases();
