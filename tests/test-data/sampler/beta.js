var _ = require('lodash');
var assert = require('assert');
var beta = require('../../../src/dists/beta');
var numeric = require('../../../src/math/numeric');
var statistics = require('../../../src/math/statistics');

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;


module.exports = {
  name: 'beta',
  sampler: beta.sample,
  inSupport: function(params, x) {
    return typeof x === 'number' && x > 0 && x < 1;
  },
  settings: [
    // params are passed to the sampler
    // n is the number of samples we'll take
    // reltol declares which stats we'll run for a single parameter value
    // and the acceptable relative tolerance for each
    {params: [0.001, 0.001], n: 2e06, skip: ['mode'], reltol: {mode: 0.2, kurtosis: 0.4}},
    {params: [0.01, 0.01], n: 5e05, skip: ['mode'], reltol: {mode: 0.2, kurtosis: 0.4}},
    {params: [0.1, 0.6], n: 5e05, skip: ['mode'], reltol: {mode: 0.2, kurtosis: 0.4}},
    {params: [1, 1], n: 5e05, skip: ['mode'], reltol: {mode: 0.2}},
    {params: [2, 0.1], n: 5e05, skip: ['mode'], reltol: {mode: 0.2, kurtosis: 0.4}},
    {params: [1, 0.2], n: 5e05, skip: ['mode'], reltol: {mode: 0.2}},
    {params: [2, 2], n: 1e05, skip: [], reltol: {mode: 0.3}},
    {params: [2, 4], n: 1e05, skip: [], reltol: {mode: 0.3}},
    {params: [3, 3], n: 1e05, skip: [], reltol: {mode: 0.3}},
    {params: [100, 100], n: 1e05, skip: [], reltol: {mode: 0.2}},
    {params: [1000, 1000], n: 1e05, skip: [], reltol: {mode: 0.2}},
    {params: [10000, 10000], n: 1e05, skip: [], reltol: {mode: 0.2}},
    {params: [65432, 123456], n: 1e05, skip: [], reltol: {mode: 0.2}}
  ],
  moment: function(params, n) {
    // returns the nth moment
    var a = params[0];
    var b = params[1];
    // https://en.wikipedia.org/wiki/Beta_distribution#Higher_moments
    return numeric.product(_.range(0, n - 1).map(function(k) { return (a + k) / (a + b + k) }))
  },
  // mostly HT https://en.wikipedia.org/wiki/Gamma_distribution
  populationStatisticFunctions: {
    mean: function(params) {
      var a = params[0];
      var b = params[1];
      return a / (a + b);
    },
    mode: function(params) {
      var a = params[0];
      var b = params[1];
      assert(a > 1, 'beta mode called with shape <= 1')
      assert(b > 1, 'beta mode called with scale <= 1')
      return (a - 1) / (a + b - 2);
    },
    variance: function(params) {
      var a = params[0];
      var b = params[1];
      return (a * b) / ((a + b) * (a + b) * (a + b + 1));
    },
    skew: function(params) {
      var a = params[0];
      var b = params[1];
      return (2 * (b - a) * Math.sqrt(a + b + 1)) / ((a + b + 2) * Math.sqrt(a * b));
    },
    kurtosis: function(params) {
      var a = params[0],
          b = params[1];
      var top = (a - b) * (a - b) * (a + 1) - a * b * (a + b + 2);
      var bot = a * b * (a + b + 2) * (a + b + 3);
      return 3 + 6 * top / bot;
    }
  }
}
