'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');
var numeric = require('../math/numeric');
var gaussian = require('./gaussian');

var LOG_2PI = numeric.LOG_2PI;

function sample(mu, sigma, dims) {
  var x = new Tensor(dims);
  var n = x.length;
  while (n--) {
    x.data[n] = gaussian.sample(mu, sigma);
  }
  return x;
}

function score(mu, sigma, dims, x) {
  var _x = ad.value(x);
  if (!util.isTensor(_x) || !_.isEqual(_x.dims, dims)) {
    return -Infinity;
  }

  var d = _x.length;
  var dLog2Pi = d * LOG_2PI;
  var _2dLogSigma = ad.scalar.mul(2 * d, ad.scalar.log(sigma));
  var sigma2 = ad.scalar.pow(sigma, 2);
  var xSubMu = ad.tensor.sub(x, mu);
  var z = ad.scalar.div(ad.tensor.sumreduce(ad.tensor.mul(xSubMu, xSubMu)), sigma2);

  return ad.scalar.mul(-0.5, ad.scalar.sum(dLog2Pi, _2dLogSigma, z));
}

var TensorGaussian = base.makeDistributionType({
  name: 'TensorGaussian',
  desc: 'Distribution over a tensor of independent Gaussian variables.',
  params: [
    {name: 'mu', desc: 'mean', type: types.unboundedReal},
    {name: 'sigma', desc: 'standard deviation', type: types.positiveReal},
    {name: 'dims', desc: 'dimension of tensor', type: types.array(types.positiveInt)}
  ],
  mixins: [base.continuousSupport],
  sample: function() {
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    var dims = this.params.dims;
    return sample(mu, sigma, dims);
  },
  score: function(x) {
    return score(this.params.mu, this.params.sigma, this.params.dims, x);
  },
  base: function() {
    var dims = this.params.dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.tensor.add(ad.tensor.mul(x, sigma), mu);
  }
});

module.exports = {
  TensorGaussian: TensorGaussian,
  sample: sample
};
