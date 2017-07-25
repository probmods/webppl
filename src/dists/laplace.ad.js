'use strict';

var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');

function sample(location, scale) {
  // Generated from goo.gl/3BxCGd (wiki)
  var z = util.random();
  var u = z - 0.5;
  return location - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

function score(location, scale, x) {
  'use ad';
  return -1 * (Math.log(2 * scale) + Math.abs(x - location) / scale);
}

var Laplace = base.makeDistributionType({
  name: 'Laplace',
  desc: 'Distribution over ``[-Infinity, Infinity]``',
  params: [{name: 'location', desc: '', type: types.unboundedReal},
           {name: 'scale', desc: '', type: types.positiveReal}],
  wikipedia: true,
  mixins: [base.continuousSupport],
  sample: function() {
    return sample(ad.value(this.params.location), ad.value(this.params.scale));
  },
  score: function(val) {
    return score(this.params.location, this.params.scale, val);
  },
  base: function() {
    return new Laplace({location: 0, scale: 1});
  },
  transform: function(x) {
    'use ad';
    var location = this.params.location;
    var scale = this.params.scale;
    return scale * x + location;
  },
  support: function() {
    return { lower: -Infinity, upper: Infinity };
  }
});

module.exports = {
  Laplace: Laplace,
  sample: sample
};
