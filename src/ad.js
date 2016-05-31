'use strict';

var _ = require('underscore');
var ad = require('adnn/ad');
var Tensor = require('./tensor');
var special = require('./special');

// TODO: Get this stuff into adnn?

// TODO: Handle tensors.
// This requires preserving the prototype (see #384) and handling
// Float64Arrays. We can /consider/ switching all the (params &&
// params.map(ad.value)) to ad.valueRec(params) once this is done.
var valueRec = function(x) {
  if (ad.isLifted(x)) {
    return x.x;
  } else if (_.isArray(x)) {
    return _.map(x, valueRec);
  } else if (_.isObject(x) && !_.isFunction(x)) {
    // Ensure prototype chain is preserved
    var proto = Object.getPrototypeOf(x);
    var y = _.mapObject(x, valueRec);
    return _.extendOwn(Object.create(proto), y);
    return y;
  } else {
    return x;
  }
};

ad.valueRec = valueRec;

ad.tensor.logGamma = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'logGamma',
  forward: function(a) {
    return a.logGamma();
  },
  backward: function(a) {
    var n = a.x.length;
    while (n--) {
      a.dx.data[n] += special.digamma(a.x.data[n]) * this.dx.data[n];
    }
  }
});

ad.scalar.logGamma = ad.newUnaryFunction({
  OutputType: Number,
  name: 'logGamma',
  forward: function(a) {
    return special.logGamma(a);
  },
  backward: function(a) {
    return a.dx += special.digamma(a.x) * this.dx;
  }
});

module.exports = ad;
