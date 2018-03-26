'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');
var numeric = require('../math/numeric');
var gaussian = require('./gaussian');
var TensorGaussian = require('./tensorGaussian').TensorGaussian;

var LOG_2PI = numeric.LOG_2PI;

function sample(mu, sigma) {
  var dims = mu.dims;
  var x = new Tensor(dims);
  var n = x.length;
  while (n--) {
    x.data[n] = gaussian.sample(mu.data[n], sigma.data[n]);
  }
  return x;
}

function score(mu, sigma, x) {
  var _x = ad.value(x);
  var _mu = ad.value(mu);
  if (!util.isTensor(_x) || !util.tensorEqDims(_x, _mu)) {
    return -Infinity;
  }

  var d = _mu.length;
  var dLog2Pi = d * LOG_2PI;
  var logDetCov = ad.scalar.mul(2, ad.tensor.sumreduce(ad.tensor.log(sigma)));
  var z = ad.tensor.div(ad.tensor.sub(x, mu), sigma);

  return ad.scalar.mul(-0.5, ad.scalar.add(
      dLog2Pi, ad.scalar.add(
      logDetCov,
      ad.tensor.sumreduce(ad.tensor.mul(z, z)))));
}

var DiagCovGaussian = base.makeDistributionType({
  name: 'DiagCovGaussian',
  desc: 'A distribution over tensors in which each element is independent and Gaussian distributed, ' +
      'with its own mean and standard deviation. i.e. A multivariate Gaussian distribution with ' +
      'diagonal covariance matrix. The distribution is over tensors that have the same shape as the ' +
      'parameters ``mu`` and ``sigma``, which in turn must have the same shape as each other.',
  params: [
    {name: 'mu', desc: 'mean', type: types.unboundedTensor},
    {name: 'sigma', desc: 'standard deviations', type: types.positiveTensor}
  ],
  mixins: [base.continuousSupport],
  constructor: function() {
    var _mu = ad.value(this.params.mu);
    var _sigma = ad.value(this.params.sigma);
    if (!util.tensorEqDims(_mu, _sigma)) {
      throw new Error(this.meta.name + ': mu and sigma should be the same shape.');
    }
  },
  sample: function() {
    return sample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return score(this.params.mu, this.params.sigma, x);
  },
  base: function() {
    var dims = ad.value(this.params.mu).dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.tensor.add(ad.tensor.mul(sigma, x), mu);
  }
});

module.exports = {
  DiagCovGaussian: DiagCovGaussian,
  sample: sample,
  score: score
};
