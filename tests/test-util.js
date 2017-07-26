'use strict';

var util = require('../src/util');
var numeric = require('../src/math/numeric');

function testAlmostEqual(test, x, y, epsilon) {
  if (x === y) {
    test.equal(x, y);
  } else {
    test.ok(Math.abs(x - y) < epsilon);
  }
}

module.exports = {

  testLogSumExp: {

    test1: function(test) {
      var epsilon = 0.0000000001;
      var xs = [-Infinity, -100, -30, -1, 0, 1, 10];
      xs.forEach(
          function(x) {
            testAlmostEqual(test, x, util.logsumexp([x]), epsilon);
            xs.forEach(
                function(y) {
                  var targetVal = Math.log(Math.exp(x) + Math.exp(y));
                  var actualVal = util.logsumexp([x, y]);
                  testAlmostEqual(test, targetVal, actualVal, epsilon);
                });
          });
      test.done();
    }

  },

  testLogAddExp: {
    test1: function(test) {
      testAlmostEqual(test, Math.exp(numeric.logaddexp(Math.log(1), Math.log(2))), 3, 1e-6);
      test.done();
    },
    test2: function(test) {
      testAlmostEqual(test, Math.exp(numeric.logaddexp(Math.log(2), Math.log(1))), 3, 1e-6);
      test.done();
    },
    test3: function(test) {
      testAlmostEqual(test, Math.exp(numeric.logaddexp(-Infinity, Math.log(1))), 1, 1e-6);
      test.done();
    },
    test4: function(test) {
      testAlmostEqual(test, Math.exp(numeric.logaddexp(Math.log(1), -Infinity)), 1, 1e-6);
      test.done();
    },
    test5: function(test) {
      testAlmostEqual(test, Math.exp(numeric.logaddexp(-Infinity, -Infinity)), 0, 1e-6);
      test.done();
    }
  },

  testCpsIterate: {

    test1: function(test) {
      var result = util.cpsIterate(5, 3,
          function(k, val) { return k(val + 2); },
          function(finalVal) { return finalVal; });
      // Trampoline.
      while (typeof result === 'function') { result = result(); }
      test.equal(result, 13);
      test.done();
    }

  },

  testIsObject: {
    test1: function(test) {
      test.strictEqual(util.isObject({}), true);
      test.done();
    },
    test2: function(test) {
      test.strictEqual(util.isObject([]), false);
      test.done();
    },
    test3: function(test) {
      test.strictEqual(util.isObject(function() {}), false);
      test.done();
    },
    test4: function(test) {
      test.strictEqual(util.isObject(undefined), false);
      test.done();
    },
    test5: function(test) {
      test.strictEqual(util.isObject(null), false);
      test.done();
    },
    test6: function(test) {
      var Thing = function() {};
      test.strictEqual(util.isObject(new Thing()), false);
      test.done();
    },
    test7: function(test) {
      test.strictEqual(util.isObject(0), false);
      test.done();
    },
    test8: function(test) {
      test.strictEqual(util.isObject('foo'), false);
      test.done();
    },
    test9: function(test) {
      test.strictEqual(util.isObject(true), false);
      test.done();
    }
  }

};
