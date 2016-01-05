'use strict';

var _ = require('underscore');
var fs = require('fs');
var assert = require('assert');
var webppl = require('../src/main');
var util = require('../src/util');
var serialize = util.serialize;

_.templateSettings = {
  interpolate: /\{\{(.+?)\}\}/g
};


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
  var msg = ['Expected ', name, ': ', serialize(expected),
             ', actual: ', serialize(actual)].join('');
  test.ok(_.isEqual(actual, expected), msg);
};


var toleranceMessage = _.template('Expected {{name}}: {{expected}}, actual: {{actual}}, tolerance: {{tolerance}}');
var testWithinTolerance = function(test, actual, expected, tolerance, name, verbose) {
  var absDiff = Math.abs(actual - expected);
  var msg = toleranceMessage({
    name: name,
    expected: expected,
    actual: actual,
    tolerance: tolerance
  });
  var isOk = absDiff < tolerance;
  if (!isOk && verbose) {
    console.log(msg)
  }
  test.ok(isOk, msg);
};

var getRandomSeedFromEnv = function()  {
  if (process.env.RANDOM_SEED) {
    var seed = parseInt(process.env.RANDOM_SEED);
    util.assertValidRandomSeed(seed);
    return seed;
  }
};

module.exports = {
  getModelNames: getModelNames,
  loadModel: loadModel,
  loadExpected: loadExpected,
  testEqual: testEqual,
  testWithinTolerance: testWithinTolerance,
  getRandomSeedFromEnv: getRandomSeedFromEnv
}
