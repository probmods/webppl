'use strict';

var assert = require('assert');
var _ = require('underscore');
var Tensor = require('adnn/tensor');
var statistics = require('./statistics');
var special = require('./special');

Tensor.prototype.logGamma = function() {
  var out = new Tensor(this.dims);
  var n = this.data.length;
  while (n--) {
    out.data[n] = special.logGamma(this.data[n]);
  }
  return out;
};

module.exports = Tensor;
