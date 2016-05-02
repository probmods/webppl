'use strict';

var _ = require('underscore');
var ad = require('adnn/ad');

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

module.exports = ad;
