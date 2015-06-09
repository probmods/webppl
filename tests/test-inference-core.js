'use strict';

var _ = require('underscore');
var fs = require('fs');
var util = require('../src/util.js');
var webppl = require('../src/main.js');

var testDataDir = './tests/test-data/';

var modelNames = [
  'binomial',
  'geometric'
];

var inferenceProcs = [
  { name: 'MH',        proc: 'MH(model, 5000);',      tol: 0.1 },
  { name: 'Enumerate', proc: 'Enumerate(model, 10);', tol: 0.01 }
];

var performTest = function (modelName, inferenceProc, test) {
  var modelText = loadModel(modelName);
  var inferenceText = inferenceProc.proc;
  var progText = modelText + inferenceText;
  var expected = loadExpected(modelName);

  webppl.run(progText, function (s, erp) {

    var hist = getHist(erp);
    test.ok(util.histsApproximatelyEqual(hist, expected.hist, inferenceProc.tol));
    test.done();

  });
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
      var testName = modelName +  inferenceProc.name;
      exports[testName] = _.partial(performTest, modelName, inferenceProc);
    });
  });
};

generateTestCases();
