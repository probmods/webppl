'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var gaussian = require('./gaussian');
var gamma = require('./gamma');
var numeric = require('../math/numeric')

var LOG_PI = numeric.LOG_PI;

// Generate StudentT variable
//
// From wiki: "One can generate Student-t samples by taking the ratio
// of variables from the normal distribution and the square-root
// of χ2-distribution."
function sample (nu, mu, sigma) {
  if (nu <= 0) {
    util.error('Degrees of freedom <= 0');
  }
  var x = gaussian.sample(0, 1);
  var y = gamma.sample(0.5 * nu, 2);
  var sample = x / Math.sqrt(y / nu);
  return sample * sigma + mu;
}

// Logp
// Based on the pdf of generalized Student's t-distributions:
//
//                                                                   -(ν+1)/2
//                Г((ν+1)/2))      1     ⌈      1                 2 ⌉
// pdf(x|ν,μ,σ) = ----------- * ------ * | 1 + --- * ((x - μ) / σ)  |
//                  Г(ν/2)       σ*√πν   ⌊      ν                   ⌋
//
// https://en.wikipedia.org/wiki/Student's_t-distribution#Generalized_Student's_t-distribution
function score (nu, mu, sigma, x) {
  'use ad';
  var score = ad.scalar.logGamma(0.5 * (nu + 1)) - ad.scalar.logGamma(0.5 * nu) -
    Math.log(sigma) - 0.5 * LOG_PI - 0.5 * Math.log(nu) -
    0.5 * (nu + 1) * Math.log(1 + Math.pow((x - mu) / sigma, 2) / nu);
  return score;
}

var StudentT = base.makeDistributionType({
  name: 'StudentT',
  desc: 'Distribution over reals.',
  params: [
    {name: 'nu', desc: 'degrees of freedom', type: types.positiveReal},
    {name: 'mu', desc: 'location', type: types.unboundedReal},
    {name: 'sigma', desc: 'scale', type: types.positiveReal}
  ],
  wikipedia: "https://en.wikipedia.org/wiki/Student's_t-distribution",
  mixins: [base.continuousSupport],
  sample: function () {
    return sample(ad.value(this.params.nu), ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function (x) {
    return score(this.params.nu, this.params.mu, this.params.sigma, x);
  },
  base: function () {
    return new StudentT({nu: this.params.nu, mu: 0, sigma: 1});
  },
  transform: function (x) {
    'use ad';
    return x * this.params.sigma + this.params.mu;
  },
  support: function () {
    return { lower: -Infinity, upper: Infinity };
  }
});

module.exports = {
  StudentT: StudentT,
  sample: sample
};
