'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var diagCovGaussian = require('./diagCovGaussian');
var TensorGaussian = require('./tensorGaussian').TensorGaussian;

// Atchison, J., and Sheng M. Shen. "Logistic-normal distributions:
// Some properties and uses." Biometrika 67.2 (1980): 261-272.

var LogisticNormal = base.makeDistributionType({
  name: 'LogisticNormal',
  desc: 'A distribution over probability vectors obtained by transforming a random variable ' +
      'drawn from ``DiagCovGaussian({mu: mu, sigma: sigma})``. If ``mu`` and ``sigma`` have length ``d`` ' +
      'then the distribution is over probability vectors of length ``d+1``.',
  params: [
    {name: 'mu', desc: 'mean', type: types.unboundedVector},
    {name: 'sigma', desc: 'standard deviations', type: types.positiveVector}
  ],
  wikipedia: 'Logit-normal_distribution#Multivariate_generalization',
  mixins: [base.continuousSupport, base.noHMC],
  constructor: function() {
    var _mu = ad.value(this.params.mu);
    var _sigma = ad.value(this.params.sigma);
    if (!util.tensorEqDim0(_mu, _sigma)) {
      throw new Error(this.meta.name + ': mu and sigma should have the same length.');
    }
  },
  sample: function() {
    return numeric.squishToProbSimplex(diagCovGaussian.sample(ad.value(this.params.mu), ad.value(this.params.sigma)));
  },
  score: function(val) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    var _mu = ad.value(mu);
    var _val = ad.value(val);

    if (!util.isVector(_val) || _val.dims[0] - 1 !== _mu.dims[0]) {
      return -Infinity;
    }

    var d = _mu.dims[0];
    var u = ad.tensor.reshape(ad.tensor.range(val, 0, d), [d, 1]);
    var u_last = ad.tensor.get(val, d);
    var inv = ad.tensor.log(ad.tensor.div(u, u_last));
    var normScore = diagCovGaussian.score(mu, sigma, inv);
    return ad.scalar.sub(normScore, ad.tensor.sumreduce(ad.tensor.log(val)));
  },
  base: function() {
    var dims = ad.value(this.params.mu).dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return numeric.squishToProbSimplex(ad.tensor.add(ad.tensor.mul(sigma, x), mu));
  }
});

module.exports = {
  LogisticNormal: LogisticNormal
};
