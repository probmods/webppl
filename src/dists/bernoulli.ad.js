'use strict';

var base = require('./base');
var util = require('../util');
var ad = require('../ad');
var types = require('../types');

var Bernoulli = base.makeDistributionType({
  name: 'Bernoulli',
  desc: 'Distribution over ``{true, false}``',
  params: [{name: 'p', desc: 'success probability', type: types.unitInterval}],
  wikipedia: true,
  mixins: [base.finiteSupport],
  sample: function() {
    return util.random() < ad.value(this.params.p);
  },
  score: function(val) {
    'use ad';
    if (val !== true && val !== false) {
      return -Infinity;
    }
    return val ? Math.log(this.params.p) : Math.log(1 - this.params.p);
  },
  support: function() {
    return [true, false];
  }
});

module.exports = {
  Bernoulli: Bernoulli
};
