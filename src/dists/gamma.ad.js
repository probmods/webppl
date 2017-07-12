'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var gaussian = require('./gaussian');

// an implementation of Marsaglia & Tang, 2000:
// A Simple Method for Generating Gamma Variables
function sample(shape, scale) {
  if (shape < 1) {
    var r;
    r = sample(1 + shape, scale) * Math.pow(util.random(), 1 / shape);
    if (r === 0) {
      util.warn('gamma sample underflow, rounded to nearest representable support value');
      return Number.MIN_VALUE;
    }
    return r;
  }
  var x, v, u;
  var d = shape - 1 / 3;
  var c = 1 / Math.sqrt(9 * d);
  while (true) {
    do {
      x = gaussian.sample(0, 1);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    u = util.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return scale * d * v;
    }
  }
}

var Gamma = base.makeDistributionType({
  name: 'Gamma',
  desc: 'Distribution over positive reals.',
  params: [{name: 'shape', desc: '', type: types.positiveReal},
           {name: 'scale', desc: '', type: types.positiveReal}],
  wikipedia: true,
  mixins: [base.continuousSupport],
  sample: function() {
    return sample(ad.value(this.params.shape), ad.value(this.params.scale));
  },
  score: function(x) {
    'use ad';
    var shape = this.params.shape;
    var scale = this.params.scale;
    return (shape - 1) * Math.log(x) - x / scale - ad.scalar.logGamma(shape) - shape * Math.log(scale);
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});

module.exports = {
  Gamma: Gamma,
  sample: sample
};
