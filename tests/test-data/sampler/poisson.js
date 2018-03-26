'use strict';

var assert = require('assert');
var poisson = require('../../../src/dists/poisson');
var util = require('../../../src/util');
var statistics = require('../../../src/math/statistics');

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;

module.exports = {
  name: 'poisson',
  sampler: poisson.sample,
  type: 'integer',
  inSupport: function(params, x) {
    return Number.isInteger(x) && x >= 0;
  },
  settings: [
    {params: [0.5], n: 1e05, reltol: {mode: 0.05}},
    {params: [1], n: 1e05, skip: ['mode']},
    {params: [4], n: 1e05, skip: ['mode']},
    {params: [4.5], n: 1e05, reltol: {mode: 0.05}},
    {params: [10], n: 1e05, skip: ['mode']},
    {params: [11], n: 1e05, skip: ['mode']},
    {params: [11.5], n: 1e05, reltol: {mode: 0.05}},
    {params: [20], n: 1e05, skip: ['mode']},
    {params: [200], n: 1e05, skip: ['mode']},
    {params: [200.5], n: 1e05, reltol: {mode: 0.05}},
  ],
  moment: function(params, N) {
    assert.ok(N === 4, "Don't know how to compute moment N=" + N);
    var mu = params[0];
    // http://mathworld.wolfram.com/PoissonDistribution.html
    return mu * (1 + 3 * mu);
  },
  populationStatisticFunctions: {
    // https://en.wikipedia.org/wiki/Poisson_distribution
    mean: function(params) {
      var mu = params[0];
      return mu;
    },
    mode: function(params) {
      var mu = params[0];
      var mode1 = Math.ceil(mu) - 1;
      var mode2 = Math.floor(mu);
      assert.ok(mode1 === mode2, "Don't know how to test multimodal distributions.");
      return mode1;
    },
    variance: function(params) {
      var mu = params[0];
      return mu;
    },
    skew: function(params) {
      var mu = params[0];
      return 1 / Math.sqrt(mu);
    },
    kurtosis: function(params) {
      var mu = params[0];
      return 3 + (1 / mu);
    }
  }
};
