'use strict';

var _ = require('lodash');
var ad = require('adnn/ad');
var Tensor = require('./tensor');
var special = require('./math/special');

var valueRec = function(x) {
  // Optimization: Return fast for common unlifted types. This
  // minimizes the overhead (of distribution argument checks for
  // example) when not using AD.
  if (typeof x === 'number' || x instanceof Tensor) {
    return x;
  } else if (ad.isLifted(x)) {
    return x.x;
  } else if (_.isArray(x)) {
    return _.map(x, valueRec);
  } else if (_.isObject(x) && !_.isFunction(x)) {
    // Ensure prototype chain is preserved
    var proto = Object.getPrototypeOf(x);
    var y = _.mapValues(x, valueRec);
    return _.assign(Object.create(proto), y);
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

ad.scalar.plus = function(x) {
  return ad.scalar.add(0, x);
};

// HACK: Used to access Tensor in daipp.
ad.tensor['__Tensor'] = Tensor;

module.exports = ad;
