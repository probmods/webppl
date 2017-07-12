'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var gaussian = require('./gaussian');

function expGammaSample(shape, scale) {
  if (shape < 1) {
    var r;
    r = expGammaSample(1 + shape, scale) + Math.log(util.random()) / shape;
    if (r === -Infinity) {
      util.warn('log gamma sample underflow, rounded to nearest representable support value');
      return -Number.MAX_VALUE;
    }
    return r;
  }
  var x, v, u, log_v;
  var d = shape - 1 / 3;
  var c = 1 / Math.sqrt(9 * d);
  while (true) {
    do {
      x = gaussian.sample(0, 1);
      v = 1 + c * x;
    } while (v <= 0);

    log_v = 3 * Math.log(v);
    v = v * v * v;
    u = util.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return Math.log(scale) + Math.log(d) + log_v;
    }
  }
}

// Not used.
function expGammaScore(shape, scale, val) {
  'use ad';
  var x = val;
  return (shape - 1) * x - Math.exp(x) / scale - ad.scalar.logGamma(shape) - shape * Math.log(scale);
}

function logBeta(a, b) {
  'use ad';
  return ad.scalar.logGamma(a) + ad.scalar.logGamma(b) - ad.scalar.logGamma(a + b);
}

function sample(a, b) {
  var log_x = expGammaSample(a, 1);
  var log_y = expGammaSample(b, 1);
  var v = 1 / (1 + Math.exp(log_y - log_x));
  if (v === 0) {
    util.warn('beta sample underflow, rounded to nearest representable support value');
    v = Number.MIN_VALUE;
  } else if (v === 1) {
    util.warn('beta sample overflow, rounded to nearest representable support value');
    v = 1 - Number.EPSILON / 2;
  }
  return v;
}

var Beta = base.makeDistributionType({
  name: 'Beta',
  desc: 'Distribution over ``[0, 1]``',
  params: [{name: 'a', desc: 'shape', type: types.positiveReal},
           {name: 'b', desc: 'shape', type: types.positiveReal}],
  wikipedia: true,
  mixins: [base.continuousSupport],
  sample: function() {
    return sample(ad.value(this.params.a), ad.value(this.params.b));
  },
  score: function(x) {
    'use ad';
    var a = this.params.a;
    var b = this.params.b;

    return ((x > 0 && x < 1) ?
            (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b) :
            -Infinity);
  },
  support: function() {
    return { lower: 0, upper: 1 };
  }
});

module.exports = {
  Beta: Beta,
  sample: sample
};
