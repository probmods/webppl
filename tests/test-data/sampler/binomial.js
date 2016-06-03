var dists = require('../../../src/dists');
var util = require('../../../src/util');
var statistics = require('../../../src/statistics');

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;


module.exports = {
  name: 'binomial',
  sampler: dists.binomialSample,
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

    {params: [0.5, 22], n: 1e06, skip: ['mode', 'skew', 'kurtosis']},

    // just check support for large n
    {params: [0.5, 100000], n: 1e06, skip: ['mean', 'variance', 'mode', 'skew', 'kurtosis']}
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
      // todo: when (n+1)p is an integer and p != 0 or 1,
      // then there are two modes: (n+1)p and (n+1)p - 1
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
      return (1 - 6 * p * (1 - p)) / (n * p * (1 - p));

    }
  }
}
