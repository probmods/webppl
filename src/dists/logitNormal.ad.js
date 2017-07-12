'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var gaussian = require('./gaussian');
var Gaussian = gaussian.Gaussian;

var LogitNormal = base.makeDistributionType({
  name: 'LogitNormal',
  desc: 'A distribution over ``(a,b)`` obtained by scaling and shifting a standard logit-normal.',
  params: [
    {name: 'mu', desc: 'location', type: types.unboundedReal},
    {name: 'sigma', desc: 'scale', type: types.positiveReal},
    {name: 'a', desc: 'lower bound', type: types.unboundedReal},
    {name: 'b', desc: 'upper bound (>a)', type: types.unboundedReal}
  ],
  wikipedia: 'Logit-normal_distribution',
  mixins: [base.continuousSupport],
  sample: function() {
    var a = ad.value(this.params.a);
    var b = ad.value(this.params.b);
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    var x = gaussian.sample(mu, sigma);
    return (ad.scalar.sigmoid(x) * (b - a)) + a;
  },
  score: function(val) {
    'use ad';
    var a = this.params.a;
    var b = this.params.b;
    var y = (val - a) / (b - a);
    var x = Math.log(y / (1 - y));
    var gaussScore = gaussian.score(this.params.mu, this.params.sigma, x);
    return gaussScore - Math.log(y * (1 - y) * (b - a));
  },
  base: function() {
    return new Gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    'use ad';
    var a = this.params.a;
    var b = this.params.b;
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return (ad.scalar.sigmoid((x * sigma) + mu) * (b - a)) + a;
  },
  support: function() {
    return {lower: this.params.a, upper: this.params.b};
  }
});

module.exports = {
  LogitNormal: LogitNormal
};
