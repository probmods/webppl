'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var gamma = require('./gamma');
var binomial = require('./binomial');

// This method comes from Ahrens and Dieters' 1974 paper "Computer
// Methods for Sampling from Gamma, Beta, Poisson and Binomial
// Distributions". The method is called Method PG, see page 240.

function sample(mu) {
  var k = 0;
  while (mu > 10) {
    var m = Math.floor(7 / 8 * mu);
    var x = gamma.sample(m, 1);
    if (x >= mu) {
      return k + binomial.sample(mu / x, m - 1);
    } else {
      mu -= x;
      k += m;
    }
  }
  var emu = Math.exp(-mu);
  var p = 1;
  do {
    p *= util.random();
    k++;
  } while (p > emu);
  return k - 1;
}

var Poisson = base.makeDistributionType({
  name: 'Poisson',
  desc: 'Distribution over integers.',
  params: [{name: 'mu', desc: 'mean', type: types.positiveReal}],
  wikipedia: true,
  sample: function() {
    return sample(ad.value(this.params.mu));
  },
  score: function(val) {
    'use ad';
    return val * Math.log(this.params.mu) - this.params.mu - numeric.lnfact(val);
  }
});

module.exports = {
  Poisson: Poisson,
  sample: sample
};
