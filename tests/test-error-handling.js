'use strict';

var _ = require('underscore');
var webppl = require('../src/main');

function getError(code, test) {
  var error;
  try {
    webppl.run(code, null, {});
  } catch (e) {
    error = e;
  }
  test.ok(error, 'Expected code to generate an error.');
  return error;
}

var tests = [
  // Ensure thrown strings are passed through error handling code.
  function(test) {
    var error = getError('util.fatal("fail")', test);
    test.strictEqual(typeof error, 'string');
    test.ok(error.match(/fail/));
    test.done();
  },
  function(test) {
    var error = getError('webpplEval("a")', test);
    test.strictEqual(typeof error, 'string');
    test.ok(error.match(/a is not defined/));
    test.done();
  },
  function(test) {
    var error = getError('webpplEval("webpplEval(a)")', test);
    test.strictEqual(typeof error, 'string');
    test.ok(error.match(/a is not defined/));
    test.done();
  }
];

var names = _.range(tests.length).map(function(i) { return 'test' + (i + 1); });
module.exports = _.object(names, tests);
