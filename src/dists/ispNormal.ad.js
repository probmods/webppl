'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var gaussian = require('./gaussian');
var Gaussian = gaussian.Gaussian;

var IspNormal = base.makeDistributionType({
  name: 'IspNormal', // For 'Inverse softplus normal'.
  nodoc: true,
  desc: 'A distribution over positive reals obtained by mapping a Gaussian ' +
      'distributed variable through the softplus function.',
  params: [
    {name: 'mu', desc: 'location', type: types.unboundedReal},
    {name: 'sigma', desc: 'scale', type: types.positiveReal}
  ],
  mixins: [base.continuousSupport],
  sample: function() {
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    return Math.log(Math.exp(gaussian.sample(mu, sigma)) + 1);
  },
  score: function(val) {
    'use ad';
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    var x = Math.log(Math.exp(val) - 1);
    return gaussian.score(mu, sigma, x) + val - x;
  },
  base: function() {
    return new Gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    'use ad';
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return Math.log(Math.exp((x * sigma) + mu) + 1);
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});

module.exports = {
  IspNormal: IspNormal
};
