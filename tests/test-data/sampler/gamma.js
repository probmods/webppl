var dists = require('../../../src/dists');
var util = require('../../../src/util');
var statistics = require('../../../src/statistics');

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;


module.exports = {
  name: 'gamma',
  sampler: dists.gammaSample,
  inSupport: function(params, x) {
    return typeof x === 'number' && x > 0 && x < Infinity;
  },
  settings: [
    // params are passed to the sampler
    // n is the number of samples we'll take
    // reltol declares which stats we'll run for a single parameter value
    // and the acceptable relative tolerance for each

    // skip skew and kurtosis for smallest shapes because they are swayed by small (underflowy) values
    {params: [1e-4, 1e4], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e-3, 1e3], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e-2, 1e2], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e-1, 1e1], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e0, 1e0], n: 5e06, skip: ['mode']},
    {params: [3e0, 9e0], n: 5e06, reltol: {mode: 0.1}},
    {params: [3e2, 2e2], n: 5e06, reltol: {mode: 0.1}},
    {params: [1e5, 3e1], n: 5e06, reltol: {mode: 0.1}}
  ],
  moment: function(params, n) {
    // returns the nth moment
    var shape = params[0];
    var scale = params[1];
    // HT http://ocw.mit.edu/courses/mathematics/
    // 18-443-statistics-for-applications-fall-2006/lecture-notes/lecture6.pdf
    // (but NB: they use shape, rate whereas we have shape, scale)
    return util.product(_.range(0, n - 1).map(function(k) { return shape + k })) * pow(scale, n)
  },
  // mostly HT https://en.wikipedia.org/wiki/Gamma_distribution
  populationStatisticFunctions: {
    mean: function(params) {
      var shape = params[0];
      var scale = params[1];
      return shape * scale;
    },
    mode: function(params) {
      var shape = params[0];
      var scale = params[1];
      assert(shape > 1, 'gamma mode called with shape <= 1')
      return (shape - 1) * scale;
    },
    variance: function(params) {
      var shape = params[0];
      var scale = params[1];
      return shape * scale * scale;
    },
    skew: function(params) {
      var shape = params[0];
      return 2 / sqrt(shape);
    },
    kurtosis: function(params) {
      var shape = params[0];
      return 3 + 6 / shape;
    }
  }
}
