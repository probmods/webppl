'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');

var LOG_2PI = numeric.LOG_2PI;

// Leva 1992: A Fast Normal Random Number Generator
function sample(mu, sigma) {
  var u, v, x, y, q;
  do {
    u = 1 - util.random();
    v = 1.7156 * (util.random() - 0.5);
    x = u - 0.449871;
    y = Math.abs(v) + 0.386595;
    q = x * x + y * (0.196 * y - 0.25472 * x);
  } while (q >= 0.27597 && (q > 0.27846 || v * v > -4 * u * u * Math.log(u)));
  return mu + sigma * v / u;
}

function score(mu, sigma, x) {
  'use ad';
  return -0.5 * (LOG_2PI + 2 * Math.log(sigma) + (x - mu) * (x - mu) / (sigma * sigma));
}

var Gaussian = base.makeDistributionType({
  name: 'Gaussian',
  desc: 'Distribution over reals.',
  params: [{name: 'mu', desc: 'mean', type: types.unboundedReal},
           {name: 'sigma', desc: 'standard deviation', type: types.positiveReal}],
  wikipedia: 'Normal_distribution',
  mixins: [base.continuousSupport],
  sample: function() {
    return sample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return score(this.params.mu, this.params.sigma, x);
  },
  base: function() {
    return new Gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    'use ad';
    // Transform a sample x from the base distribution to the
    // distribution described by params.
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return sigma * x + mu;
  }
});

module.exports = {
  Gaussian: Gaussian,
  sample: sample,
  score: score
};
