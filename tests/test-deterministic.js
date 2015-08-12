'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var util = require('../src/util.js');
var webppl = require('../src/main.js');
var erp = require('../src/erp.js');

var testDataDir = './tests/test-data/';

var wpplRunModel = function(modelName) {
  var progText = loadModel(modelName);
  var result;
  try {
    webppl.run(progText, function(s, val) { result = val; });
  } catch (e) {
    console.log('Exception:' + e);
    throw e;
  }
  return result;
};

var testEqual = function(test, actual, expected, name) {
  var msg = ['Expected ', name, ': ', expected, ', actual: ', actual].join('');
  test.ok(actual === expected, msg);
};

var getModelNames = function() {
  var filenames = fs.readdirSync(testDataDir + 'deterministic/');
  return _.map(filenames, function(fn) { return fn.split('.')[0]; });
};

var loadModel = function(modelName) {
  var filename = testDataDir + 'deterministic/' + modelName + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var loadExpected = function(modelName) {
  var filename = testDataDir + 'expected/' + modelName + '.json';
  return JSON.parse(fs.readFileSync(filename, 'utf-8'));
};

var generateTestCases = function() {
  var modelNames = getModelNames();
  _.each(modelNames, function(modelName) {
    exports[modelName] = function(test) {
      var result = wpplRunModel(modelName);
      var expected = loadExpected(modelName);
      testEqual(test, result, expected.result, modelName);
      test.done();
    }
  });
};

generateTestCases();
