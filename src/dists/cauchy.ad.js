'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var Uniform = require('./uniform').Uniform;

var LOG_PI = numeric.LOG_PI;

var Cauchy = base.makeDistributionType({
  name: 'Cauchy',
  desc: 'Distribution over ``[-Infinity, Infinity]``',
  params: [{name: 'location', desc: '', type: types.unboundedReal},
           {name: 'scale', desc: '', type: types.positiveReal}],
  wikipedia: true,
  mixins: [base.continuousSupport],
  sample: function() {
    var u = util.random();
    return ad.value(this.params.location) + ad.value(this.params.scale) * Math.tan(Math.PI * (u - 0.5));
  },
  score: function(x) {
    'use ad';
    var scale = this.params.scale;
    var location = this.params.location;
    return -LOG_PI - Math.log(scale) - Math.log(1 + Math.pow((x - location) / scale, 2));
  },
  base: function() {
    return new Uniform({a: 0, b: 1});
  },
  transform: function(x) {
    'use ad';
    var location = this.params.location;
    var scale = this.params.scale;
    return location + scale * Math.tan(Math.PI * (x - 0.5));
  }
});

module.exports = {
  Cauchy: Cauchy
};
