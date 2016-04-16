'use strict';

var analysis = require('../src/analysis/main');

var Set = require('immutable').Set;

var tests = {
  // Commented out as AD macros now transform '+' into 'ad.scalar.add' which
  // causes the test to fail.
  // constant: {
  //   program: '3 + 4',
  //   values: Set.of(7)
  // }
  // Tests commented out as analyze does not handle undefined which
  // appears in flip.
  // call: {
  //   program: 'flip(0.5)',
  //   values: Set.of(true, false)

  // },
  // recursion: {
  //   program: [
  //     'var geom = function() {',
  //     '    return flip(0.5) ? 0 : 1 + geom();',
  //     '}',
  //     'geom();'].join('\n'),
  //   values: Set.of(0)
  // }
};

function makeTest(t) {
  return function(test) {
    var results = analysis.analyze(analysis.prepare(t.program));

    var values = results.finals.reduce(function(values, result) {
      return values.union(result.value);
    }, new Set());

    if (t.values.isSubset(values)) {
      test.ok(true);
    }
    else {
      test.ok(false, 'analyzer is unsound (or test is wrong)');
    }

    test.done();
  };
}

exports.test = (function(tests) {
  var testfs = {};

  for (var test in tests) {
    if (tests.hasOwnProperty(test)) {
      testfs[test] = makeTest(tests[test]);
    }
  }

  return testfs;
})(tests);
