'use strict';

var stats = require('../src/statistics');

module.exports = {

  testMean: {

    test1: function(test) {
      test.strictEqual(stats.mean([0, 3, 9]), 4);
      test.done();
    },
    test2: function(test) {
      test.strictEqual(stats.mean(new Float64Array([0, 3, 9])), 4);
      test.done();
    },
    test3: function(test) {
      test.throws(function() { stats.mean([]); });
      test.done();
    }

  },

  testStandardDeviation: {

    test1: function(test) {
      test.strictEqual(stats.sd([0, 1, 2]), Math.sqrt(2 / 3));
      test.done();
    },
    test2: function(test) {
      test.strictEqual(stats.sd(new Float64Array([0, 1, 2])), Math.sqrt(2 / 3));
      test.done();
    },
    test3: function(test) {
      test.throws(function() { stats.sd([]); });
      test.done();
    }

  }

};
