'use strict';

// Tests for deterministic code written in webppl (e.g., preamble functions)

var webppl = require('../src/main.js');
var helpers = require('./helpers.js');

var testDataDir = './tests/test-data/deterministic/';

var generateTestCases = function() {
  var modelNames = helpers.getModelNames(testDataDir);
  modelNames.forEach(function(modelName) {
    var model = helpers.loadModel(testDataDir, modelName);
    var expected = helpers.loadExpected(testDataDir, modelName);
    exports[modelName] = function(test) {
      var result;
      try {
        webppl.run(model, function(s, val) { result = val; });
      } catch (e) {
        console.log('Exception:' + e);
        throw e;
      }
      helpers.testEqual(test, result, expected['result'], modelName);
      test.done();
    };
  });
};

generateTestCases();
