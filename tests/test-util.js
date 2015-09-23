'use strict';

var util = require('../src/util');

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

  }

};
