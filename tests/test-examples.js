'use strict';

var _ = require('underscore');
var fs = require('fs');
var webppl = require('../src/main.js');

var examplesDir = './examples/';

var examples = [
  'binomial',
  'geometric',
  'hmm',
  'hmmIncremental',
  'pcfg',
  'pcfgIncremental',
  'scalarImplicature',
  'semanticParsing',
  'pragmaticsWithSemanticParsing',
  'multiplex'
];

var loadExample = function(example) {
  var filename = examplesDir + example + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var isErp = function(erp) {
  return _.every(['sample', 'support', 'sample'], function(property) {
    return _.isFunction(erp[property]);
  })
};

var generateTestCases = function() {
  _.each(examples, function(example) {
    exports[example] = function(test) {
      test.doesNotThrow(function() {
        webppl.run(loadExample(example), function(s, erp) {
          test.ok(isErp(erp));
        });
      });
      test.done();
    };
  });
};

generateTestCases();
