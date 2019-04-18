'use strict';

var T = require('../../../src/dists/studentT');

module.exports = {
  name: 'studentT',
  sampler: T.sample,
  inSupport: function (params, x) {
    return typeof x === 'number' && x > -Infinity && x < Infinity;
  },
  settings: [
    {params: [3, 0, 1], n: 1e05, abstol: {mode: 0.2, mean: 0.2, variance: 0.5}, skip: ['skew', 'kurtosis']},
    {params: [10, 20, 2], n: 1e05, abstol: {mode: 1, mean: 0.5, variance: 0.5}, skip: ['skew', 'kurtosis']},
    {params: [100, -8, 3.1], n: 1e05, abstol: {mode: 2, mean: 1, variance: 1}, skip: ['skew', 'kurtosis']}
  ],
  moment: function(params, k) {
    var df = params[0];
    if (df % 2 === 0) {
      var p = 1
      for (var i = 1; i <= k / 2; i++) {
        p *= (2 * i - 1) / (df - 2 * i);
      }
      return Math.pow(df, 0.5 * k) * p;
    } else {
      return 0;
    }
  },
  populationStatisticFunctions: {
    mean: function (params) {
      var location = params[1];
      return location;
    },
    mode: function (params) {
      var location = params[1];
      return location;
    },
    variance: function (params) {
      var df = params[0]
      var scale = params[2];
      return scale * scale * df / (df - 2);
    }
  }
}
