'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');
var gamma = require('./gamma');

function sample(alpha) {
  var n = alpha.dims[0];
  var ssum = 0;
  var theta = new Tensor([n, 1]);
  var t;

  // sample n gammas
  for (var i = 0; i < n; i++) {
    t = gamma.sample(alpha.data[i], 1);
    theta.data[i] = t;
    ssum += t;
  }

  // normalize and catch under/overflow
  for (var j = 0; j < n; j++) {
    theta.data[j] /= ssum;
    if (theta.data[j] === 0) {
      theta.data[j] = Number.MIN_VALUE;
    }
    if (theta.data[j] === 1) {
      theta.data[j] = 1 - Number.EPSILON / 2;
    }
  }
  return theta;
}

function score(alpha, val) {
  var _val = ad.value(val);
  var _alpha = ad.value(alpha);
  if (!util.isVector(_val) || !util.tensorEqDim0(_val, _alpha)) {
    return -Infinity;
  }

  return ad.scalar.add(
      ad.tensor.sumreduce(
      ad.tensor.sub(
      ad.tensor.mul(
          ad.tensor.sub(alpha, 1),
          ad.tensor.log(val)),
      ad.tensor.logGamma(alpha))),
      ad.scalar.logGamma(ad.tensor.sumreduce(alpha)));
}

var Dirichlet = base.makeDistributionType({
  name: 'Dirichlet',
  desc: 'Distribution over probability vectors. ' +
      'If ``alpha`` has length ``d`` then the distribution ' +
      'is over probability vectors of length ``d``.',
  params: [{name: 'alpha', desc: 'concentration', type: types.positiveVector}],
  wikipedia: true,
  mixins: [base.continuousSupport, base.noHMC],
  sample: function() {
    return sample(ad.value(this.params.alpha));
  },
  score: function(val) {
    return score(this.params.alpha, val);
  }
});

module.exports = {
  Dirichlet: Dirichlet
};
