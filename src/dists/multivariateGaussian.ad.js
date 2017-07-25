'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');
var numeric = require('../math/numeric');
var gaussian = require('./gaussian');
var TensorGaussian = require('./tensorGaussian').TensorGaussian;

var T = ad.tensor;
var LOG_2PI = numeric.LOG_2PI;

function sample(mu, cov) {
  var d = mu.dims[0];
  var z = new Tensor([d, 1]);
  for (var i = 0; i < d; i++) {
    z.data[i] = gaussian.sample(0, 1);
  }
  var L = cov.cholesky();
  return L.dot(z).add(mu);
}

function score(mu, cov, x) {
  var _x = ad.value(x);
  var _mu = ad.value(mu);
  if (!util.isVector(_x) || !util.tensorEqDim0(_x, _mu)) {
    return -Infinity;
  }

  var d = _mu.dims[0];
  var dLog2Pi = d * LOG_2PI;
  var det = ad.tensor.determinant(cov);
  if (ad.value(det) <= 0) {
    throw new Error('The covariance matrix is not positive definite.');
  }
  var logDetCov = ad.scalar.log(det);
  var z = ad.tensor.sub(x, mu);
  var zT = ad.tensor.transpose(z);
  var prec = ad.tensor.inverse(cov);
  return ad.scalar.mul(-0.5, ad.scalar.add(
      dLog2Pi, ad.scalar.add(
      logDetCov,
      ad.tensor.get(ad.tensor.dot(ad.tensor.dot(zT, prec), z), 0))));
}

var MultivariateGaussian = base.makeDistributionType({
  name: 'MultivariateGaussian',
  desc: 'Multivariate Gaussian distribution with full covariance matrix. ' +
      'If ``mu`` has length d and ``cov`` is a ``d``-by-``d`` matrix, ' +
      'then the distribution is over vectors of length ``d``.',
  params: [{name: 'mu', desc: 'mean', type: types.unboundedVector},
           {name: 'cov', desc: 'covariance', type: types.posDefMatrix}],
  wikipedia: 'Multivariate_normal_distribution',
  mixins: [base.continuousSupport],
  constructor: function() {
    var _mu = ad.value(this.params.mu);
    var _cov = ad.value(this.params.cov);
    if (!util.tensorEqDim0(_mu, _cov)) {
      throw new Error(this.meta.name + ': dimension mismatch between mu and cov.');
    }
  },
  sample: function() {
    return sample(ad.value(this.params.mu), ad.value(this.params.cov));
  },
  score: function(val) {
    return score(this.params.mu, this.params.cov, val);
  },
  base: function() {
    var dims = ad.value(this.params.mu).dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    'use ad';
    var mu = this.params.mu;
    var cov = this.params.cov;
    var L = T.cholesky(cov);
    return T.add(T.dot(L, x), mu);
  }
});

module.exports = {
  MultivariateGaussian: MultivariateGaussian
};
