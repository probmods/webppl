var erp = require('../../../src/erp.js');

var util = require('../../../src/util.js');

var statistics = require('../../../src/statistics.js');

var ln = Math.log,
    pow = Math.pow,
    sqrt = Math.sqrt,
    abs = Math.abs;


module.exports = {
  name: 'gamma',
  sampler: erp.gammaERP.sample,
  inSupport: function(params, x) {
    var giveLog = params[2];
    if (giveLog) {
      return typeof x === 'number' && x > -Infinity && x < Infinity;
    } else {
      return typeof x === 'number' && x > 0 && x < Infinity;
    }
  },
  settings: [
    // params are sampled to the ERP sampler
    // n is the number of samples we'll take
    // reltol declares which stats we'll run for a single parameter value
    // and the acceptable relative tolerance for each

    // skip skew and kurtosis for smallest shapes because they are swayed by small (underflowy) values
    {params: [1e-4, 1e4, false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e-3, 1e3, false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e-2, 1e2 , false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e-1, 1e1, false], n: 5e06, skip: ['mode', 'skew', 'kurtosis']},
    {params: [1e0, 1e0, false], n: 5e06, skip: ['mode']},
    {params: [3e0, 9e0, false], n: 5e06, reltol: {mode: 0.1}},
    {params: [3e2, 2e2, false], n: 5e06, reltol: {mode: 0.1}},
    {params: [1e5, 3e1, false], n: 5e06, reltol: {mode: 0.1}}

    // // disable giveLog tests for now because i don't know how to compute moments
    // {params: [1e-4, 1e4, true], n: 5e05, skip: ['mode','skew','kurtosis']},
    // {params: [1e-3, 1e3, true], n: 5e05, skip: ['mode','skew','kurtosis']},
    // {params: [1e-2, 1e2 , true], n: 5e05, skip: ['mode','skew','kurtosis']},
    // {params: [1e-1, 1e1, true], n: 5e05, skip: ['mode','skew','kurtosis']},
    // {params: [1e0, 1e0, true], n: 5e05, skip: ['mode', 'skew','kurtosis']}, // kurtosis is finicky
    // {params: [3e0, 9e0, true], n: 5e05, reltol: {mode: 0.1}, skip: ['skew','kurtosis']},
    // {params: [3e2, 2e2, true], n: 5e05, reltol: {mode: 0.1}, skip: ['skew','kurtosis']},
    // {params: [1e5, 3e1, true], n: 5e05, reltol: {mode: 0.1}, skip: ['skew','kurtosis']}

  ],
  moment: function(params, n) {
    // returns the nth moment
    var shape = params[0];
    var scale = params[1];
    // HT
    // http://ocw.mit.edu/courses/mathematics/
    // 18-443-statistics-for-applications-fall-2006/lecture-notes/lecture6.pdf
    // (but NB: they use shape, rate whereas we have shape, scale)
    return util.product(_.range(0, n - 1).map(function(k) { return shape + k })) * pow(scale, n)
  },
  // mostly HT https://en.wikipedia.org/wiki/Gamma_distribution
  populationStatisticFunctions: {
    mean: function(params) {
      var shape = params[0];
      var scale = params[1];
      var giveLog = params[2];

      if (giveLog) {
        return statistics.digamma(shape) + ln(scale)
      } else {
        return shape * scale;
      }
    },
    mode: function(params) {
      var shape = params[0];
      var scale = params[1];
      var giveLog = params[2];

      assert(shape > 1, 'gamma mode called with shape <= 1')
      if (giveLog) {
        // HT http://stats.stackexchange.com/questions/40989/density-of-y-logx-for-gamma-distributed-x
        return ln(shape * scale);
      } else {
        return (shape - 1) * scale;
      }

    },
    variance: function(params) {
      var shape = params[0];
      var scale = params[1];
      var giveLog = params[2];

      if (giveLog) {
        return statistics.trigamma(shape)
      } else {
        return shape * scale * scale;
      }
    },
    skew: function(params) {
      var shape = params[0];
      var giveLog = params[2];

      if (giveLog) {
        throw new Error('gamma skew not implemented for log samples');
      } else {
        return 2 / sqrt(shape);
      }
    },
    kurtosis: function(params) {
      var shape = params[0];
      var giveLog = params[2];

      if (giveLog) {
        throw new Error('gamma kurtosis not implemented for log samples');
      } else {
        return 3 + 6 / shape;
      }
    }
  }
}
