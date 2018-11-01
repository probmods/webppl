'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var gaussian = require('./gaussian');

var LOG_2PI = numeric.LOG_2PI;

function score(mu, sigma, x) {
  'use ad';
  var logx = Math.log(x);
  return (
    -logx - Math.log(sigma) - 0.5 * (
      LOG_2PI + (logx - mu) * (logx - mu) / (sigma * sigma)
    )
  )
}

function sample(mu, sigma) {
  var gaussian_sample = gaussian.sample(mu, sigma);
  return Math.exp(gaussian_sample);
}

var LogNormal = base.makeDistributionType({
  name: 'LogNormal',
  desc: 'Distribution over non-negative reals where the log of the random ' +
    'variable is normally distributed.',
  params: [{name: 'mu', desc: 'mean', type: types.unboundedReal},
           {name: 'sigma', desc: 'standard deviation', type: types.positiveReal}],
  wikipedia: 'Log-normal_distribution',
  mixins: [base.continuousSupport],
  sample: function() {
    return sample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return score(this.params.mu, this.params.sigma, x);
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
  // for reparameterization for variational inference
  // base: function() {
  // },
  // transform: function(x) {
  // }
});

module.exports = {
  LogNormal: LogNormal,
  sample: sample,
  score: score
};
