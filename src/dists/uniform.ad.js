'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');

var Uniform = base.makeDistributionType({
  name: 'Uniform',
  desc: 'Continuous uniform distribution over ``[a, b]``',
  params: [{name: 'a', desc: 'lower bound', type: types.unboundedReal},
           {name: 'b', desc: 'upper bound (>a)', type: types.unboundedReal}],
  wikipedia: 'Uniform_distribution_(continuous)',
  mixins: [base.continuousSupport],
  sample: function() {
    var u = util.random();
    return (1 - u) * ad.value(this.params.a) + u * ad.value(this.params.b);
  },
  score: function(val) {
    'use ad';
    if (val < this.params.a || val > this.params.b) {
      return -Infinity;
    }
    return -Math.log(this.params.b - this.params.a);
  },
  support: function() {
    return { lower: this.params.a, upper: this.params.b };
  }
});

module.exports = {
  Uniform: Uniform
};
