'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');

var Delta = base.makeDistributionType({
  name: 'Delta',
  desc: 'Discrete distribution that assigns probability one to the single ' +
      'element in its support. This is only useful in special circumstances as sampling ' +
      'from ``Delta({v: val})`` can be replaced with ``val`` itself. Furthermore, a ``Delta`` ' +
      'distribution parameterized by a random choice should not be used with MCMC based inference, ' +
      'as doing so produces incorrect results.',
  params: [{name: 'v', desc: 'support element', type: types.any}],
  mixins: [base.finiteSupport],
  sample: function() {
    return ad.value(this.params.v);
  },
  score: function(val) {
    return ad.value(val) === ad.value(this.params.v) ? 0 : -Infinity;
  },
  support: function() {
    return [this.params.v];
  },
  base: function() {
    return this;
  },
  transform: function(x) {
    return this.params.v;
  }
});

module.exports = {
  Delta: Delta
};
