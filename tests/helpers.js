'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var webppl = require('../src/main');


var getModelNames = function(testDataDir) {
  var filenames = fs.readdirSync(testDataDir + 'models/');
  return _.map(filenames, function(fn) { return fn.split('.')[0]; });
};

var loadModel = function(testDataDir, modelName) {
  var filename = testDataDir + 'models/' + modelName + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var loadExpected = function(testDataDir, modelName) {
  var filename = testDataDir + 'expected/' + modelName + '.json';
  return JSON.parse(fs.readFileSync(filename, 'utf-8'));
};

var testEqual = function(test, actual, expected, name) {
  var msg = ['Expected ', name, ': ', JSON.stringify(expected),
             ', actual: ', JSON.stringify(actual)].join('');
  test.ok(_.isEqual(actual, expected), msg);
};

var testWithinTolerance = function(test, actual, expected, tolerance, name) {
  var absDiff = Math.abs(actual - expected);
  var msg = ['Expected ', name, ': ', expected, ', actual: ', actual].join('');
  test.ok(absDiff < tolerance, msg);
};


module.exports = {
  getModelNames: getModelNames,
  loadModel: loadModel,
  loadExpected: loadExpected,
  testEqual: testEqual,
  testWithinTolerance: testWithinTolerance
}
