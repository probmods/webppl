'use strict';

var webppl = require('../src/main');
var util = require('../src/util');
var dists = require('../src/dists');
var helpers = require('./helpers/helpers');

// notes for more extensive tests
// binomial space: N * P * X
// ensure that scores for support [0,...,X] sum to close to 1
// ensure that values outside of support have -Infinity

var makeBinomialTest = function(n, p, x, should, tol) {
  if (tol === undefined) {
    tol = 0;
  }
  return function(test) {
    test.expect(1)
    var b = new dists.Binomial({n: n, p: p});
    var actual = b.score(x);
    //test.equal(actual, should, 'got ' + actual + ', wanted ' + should);
    helpers.testWithinTolerance(test,
                                actual,
                                should,
                                tol,
                                'score'
    )
    test.done()
  }
};


var oldSuppressWarnings = !!global.suppressWarnings;
var oldStackTraceLimit = Error.stackTraceLimit;

exports.setUp = function(callback) {
  // suppress warnings (for, e.g., underflow)
  global.suppressWarnings = true;

  // less noise from stack trace
  Error.stackTraceLimit = 0;
  callback()
};

exports.tearDown = function(callback) {
  global.suppressWarnings = oldSuppressWarnings;
  Error.stackTraceLimit = oldStackTraceLimit;
  callback()
};

var ln = Math.log;

exports.binomial = {
  'n=1': {
    'p=0': {
      'x=0': makeBinomialTest(1, 0.0, 0, 0),
      'x=1': makeBinomialTest(1, 0.0, 1, -Infinity),
      'x=2': makeBinomialTest(1, 0.0, 2, -Infinity),
      'x=-1': makeBinomialTest(1, 0.0, -1, -Infinity)
    },
    'p=0.6': {
      'x=0': makeBinomialTest(1, 0.6, 0, Math.log(0.4)),
      'x=1': makeBinomialTest(1, 0.6, 1, Math.log(0.6)),
      'x=2': makeBinomialTest(1, 0.6, 2, -Infinity),
      'x=-1': makeBinomialTest(1, 0.6, -1, -Infinity)
    },
    'p=1': {
      'x=0': makeBinomialTest(1, 1.0, 0, -Infinity),
      'x=1': makeBinomialTest(1, 1.0, 1, 0),
      'x=2': makeBinomialTest(1, 1.0, 2, -Infinity),
      'x=-1': makeBinomialTest(1, 1.0, -1, -Infinity)
    }
  },
  'n=2': {
    'p=0': {
      'x=0': makeBinomialTest(2, 0.0, 0, 0),
      'x=1': makeBinomialTest(2, 0.0, 1, -Infinity),
      'x=2': makeBinomialTest(2, 0.0, 2, -Infinity),
      'x=-1': makeBinomialTest(2, 0.0, -1, -Infinity)
    },
    'p=0.6': {
      'x=0': makeBinomialTest(2, 0.6, 0, ln(.4) + ln(.4)),
      'x=1': makeBinomialTest(2, 0.6, 1, ln(2) + ln(.4) + ln(.6)),
      'x=2': makeBinomialTest(2, 0.6, 2, ln(.6) + ln(.6)),
      'x=3': makeBinomialTest(2, 0.6, 3, -Infinity),
      'x=-1': makeBinomialTest(2, 0.6, -1, -Infinity)
    },
    'p=1': {
      'x=0': makeBinomialTest(2, 1.0, 0, -Infinity),
      'x=1': makeBinomialTest(2, 1.0, 1, -Infinity),
      'x=2': makeBinomialTest(2, 1.0, 2, 0),
      'x=-1': makeBinomialTest(2, 1.0, -1, -Infinity)
    }
  },
  'n=501': {
    'p=0': {
      'x=0': makeBinomialTest(501, 0.0, 0, 0),
      'x=1': makeBinomialTest(501, 0.0, 500, -Infinity),
      'x=501': makeBinomialTest(501, 0.0, 501, -Infinity),
      'x=-1': makeBinomialTest(501, 0.0, -1, -Infinity)
    },
    'p=0.6': {
      'x=0': makeBinomialTest(501, 0.6, 0, 501 * ln(.4)),
      'x=1': makeBinomialTest(501, 0.6, 1, 500 * ln(.4) + 1 * ln(0.6) + ln(501), 0.00000000001),
      'x=2': makeBinomialTest(501, 0.6, 2, 499 * ln(.4) + 2 * ln(0.6) + ln(125250)),
      'x=502': makeBinomialTest(501, 0.6, 502, -Infinity),
      'x=-1': makeBinomialTest(501, 0.6, -1, -Infinity)
    },
    'p=1': {
      'x=0': makeBinomialTest(501, 1.0, 0, -Infinity),
      'x=501': makeBinomialTest(501, 1.0, 501, 0),
      'x=502': makeBinomialTest(501, 1.0, 502, -Infinity),
      'x=-1': makeBinomialTest(501, 1.0, -1, -Infinity)
    }
  }

};
