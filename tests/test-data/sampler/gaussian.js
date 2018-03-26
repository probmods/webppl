'use strict';

var gaussian = require('../../../src/dists/gaussian');
var util = require('../../../src/util');
var statistics = require('../../../src/math/statistics');
var doubleFactorial = require('../../../src/math/special').doubleFactorial;

module.exports = {
  name: 'gaussian',
  sampler: gaussian.sample,
  inSupport: function(params, x) {
    return typeof x === 'number' && x > -Infinity && x < Infinity;
  },
  settings: [
    {params: [0, 1], n: 1e05, abstol: {mode: 0.5}},
    {params: [-1, 100], n: 5e05, abstol: {mode: 20}},
    {params: [654321, 10], n: 1e05, abstol: {mode: 10}},
    {params: [0, 0.0001], n: 1e05, abstol: {mode: 0.1}},
    {params: [123456789, 0.0001], n: 1e05, abstol: {mode: 0.1}},
    {params: [123456789, 5678], n: 1e05, reltol: {mode: 0.05}}
  ],
  moment: function(params, n) {
    var sigma = params[1];
    // HT https://en.wikipedia.org/wiki/Normal_distribution#Moments
    return Math.pow(sigma, n) * doubleFactorial(n - 1);

  },
  // HT https://en.wikipedia.org/wiki/Normal_distribution
  populationStatisticFunctions: {
    mean: function(params) {
      var mu = params[0];
      return mu;
    },
    mode: function(params) {
      var mu = params[0];
      return mu;
    },
    variance: function(params) {
      var sigma = params[1];
      return sigma * sigma;
    },
    skew: function(params) {
      return 0;
    },
    kurtosis: function(params) {
      return 3;
    }
  }
}
