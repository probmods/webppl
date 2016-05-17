'use strict';

var _ = require('underscore');
var parse = require('esprima').parse;
var caching = require('../src/transforms/caching');

var hasCachingDirectiveTests = {
  test1: { code: "'no caching'", expected: true },
  test2: { code: '"no caching";\n', expected: true },
  test3: { code: '\n"no caching";\n1+1', expected: true },
  test4: { code: '1 + 1', expected: false },
  test5: { code: "1 + 1;\n'no caching'", expected: false },
  test6: { code: '', expected: false }
};

var transformRequiredTests = {
  test1: { code: 'IncrementalMH(model, 0);', expected: true },
  test2: { code: 'Enumerate(model);', expected: false },
  test3: { code: 'Infer(model, {method: "IncrementalMH"});', expected: true },
  test4: { code: 'Infer(model, {method: "Enumerate"});', expected: false },
  test5: { code: '({method: "IncrementalMH"})', expected: true },
  test6: { code: '({method: "Enumerate"})', expected: false },
  test7: { code: '({"method": "IncrementalMH"})', expected: true },
  test8: { code: '({"method": "Enumerate"})', expected: false }
};

function generateTests(cases, testFn) {
  return _.mapObject(cases, function(caseDef) {
    return function(test) {
      test.strictEqual(testFn(parse(caseDef.code)), caseDef.expected);
      test.done();
    };
  });
}

module.exports = {
  hasNoCachingDirective: generateTests(hasCachingDirectiveTests, caching.hasNoCachingDirective),
  transformRequired: generateTests(transformRequiredTests, caching.transformRequired)
};
