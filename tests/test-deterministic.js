'use strict';

// Tests for deterministic code written in webppl (e.g., preamble functions)

var webppl = require('../src/main');
var helpers = require('./helpers');

var testDataDir = './tests/test-data/deterministic/';

var generateTestCases = function() {
  var modelNames = helpers.getModelNames(testDataDir);
  modelNames.forEach(function(modelName) {
    var model = helpers.loadModel(testDataDir, modelName);
    var expected = helpers.loadExpected(testDataDir, modelName);
    exports[modelName] = function(test) {
      var result;
      webppl.run(model, function(s, val) { result = val; });
      helpers.testEqual(test, result, expected.result, 'result');
      test.done();
    };
  });
};

generateTestCases();
