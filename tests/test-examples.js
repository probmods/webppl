'use strict';

var _ = require('underscore');
var fs = require('fs');
var webppl = require('../src/main');
var dists = require('../src/dists');

var examplesDir = './examples/';

var examples = [
  'binomial',
  'geometric',
  'hmm',
  'hmmIncremental',
  'lda',
  'ldaCollapsed',
  'linearRegression',
  'logisticRegression',
  'multivariateRegression',
  'pcfg',
  'pcfgIncremental',
  'scalarImplicature',
  'semanticParsing',
  'pragmaticsWithSemanticParsing'
];

var loadExample = function(example) {
  var filename = examplesDir + example + '.wppl';
  return fs.readFileSync(filename, 'utf-8');
};

var generateTestCases = function() {
  _.each(examples, function(example) {
    exports[example] = function(test) {
      test.doesNotThrow(function() {
        webppl.run(loadExample(example), function(s, val) {
          test.ok(dists.isDist(val));
        });
      });
      test.done();
    };
  });
};

generateTestCases();
