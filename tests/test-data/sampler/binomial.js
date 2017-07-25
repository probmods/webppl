var binomial = require('../../../src/dists/binomial');
var util = require('../../../src/util');
var statistics = require('../../../src/math/statistics');

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;


module.exports = {
  name: 'binomial',
  sampler: binomial.sample,
  type: 'integer',
  inSupport: function(params, x) {
    var n = params[1];
    return typeof x === 'number' && x % 1 === 0 & x >= 0 && x <= n;
  },
  settings: [
    // params are passed to the sampler
    // n is the number of samples we'll take
    // reltol declares which stats we'll run for a single parameter value
    // and the acceptable relative tolerance for each

    // edge cases
    {params: [0.0, 1], n: 1e02, skip: ['skew', 'kurtosis'], reltol: {mode: 0.1}},
    {params: [1.0, 1], n: 1e02, skip: ['mode', 'skew', 'kurtosis'], reltol: {mode: 0.1}},
    {params: [0.0, 201], n: 1e02, skip: ['skew', 'kurtosis'], reltol: {mode: 0.1}},
    {params: [1.0, 201], n: 1e02, skip: ['mode', 'skew', 'kurtosis'], reltol: {mode: 0.1}},


    {params: [0.1, 1], n: 1e04, skip: ['skew', 'kurtosis'], reltol: {mode: 0.1}},
    {params: [0.9, 1], n: 1e04, skip: ['skew', 'kurtosis'], reltol: {mode: 0.1}},

    {params: [0.5, 22], n: 1e05, reltol: {mode: 0.1}},

    {params: [0.37, 51], n: 1e05, reltol: {mode: 0.1}},
    {params: [0.37, 101], n: 1e05, reltol: {mode: 0.1}},
    {params: [0.37, 201], n: 1e05, reltol: {mode: 0.1}},
    {params: [0.37, 100000], n: 1e05, reltol: {mode: 0.1}},

    {params: [0.001, 201], n: 1e05, reltol: {mode: 0.1}},
    {params: [0.999, 201], n: 1e05, reltol: {mode: 0.1}}
  ],
  moment: function(params, N) {
    // returns the Nth moment
    var p = params[0];
    var n = params[1];

    if (N == 1) {
      return n * p;
    } else if (N == 2) {
      return n * p * (1 - p)
    } else if (N == 3) {
      // HT mathematica
      return n * p * ((n - 2) * (n - 1) * p * p + 3 * (n - 1) * p + 1);
    } else if (N == 4) {
      // HT mathematica
      return n * p * ((n - 3) * (n - 2) * (n - 1) * p * p * p + 6 * (n - 2) * (n - 1) * p * p + 7 * (n - 1) * p + 1)
    }
  },
  // mostly HT https://en.wikipedia.org/wiki/Gamma_distribution
  populationStatisticFunctions: {
    mean: function(params) {
      var p = params[0];
      var n = params[1];
      return n * p;
    },
    mode: function(params) {
      var p = params[0];
      var n = params[1];
      // When (n+1)p is an integer and p != 0 or 1, then there are two
      // modes: (n+1)p and (n+1)p - 1
      if (Number.isInteger((n + 1) * p) &&
          p !== 0 && p !== 1) {
        throw new Error("Don't know how to test multimodal distributions.");
      }
      return Math.floor((n + 1) * p)
    },
    variance: function(params) {
      var p = params[0];
      var n = params[1];
      return n * p * (1 - p);
    },
    skew: function(params) {
      var p = params[0];
      var n = params[1];
      return (1 - 2 * p) / sqrt(n * p * (1 - p));

    },
    kurtosis: function(params) {
      var p = params[0];
      var n = params[1];
      return 3 + (1 - 6 * p * (1 - p)) / (n * p * (1 - p));

    }
  }
}
