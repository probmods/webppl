'use strict';

var assert = require('assert');
var _ = require('underscore');
var Tensor = require('adnn/tensor');
var inspect = require('util').inspect;
var statistics = require('./statistics');
var special = require('./special');

// TODO: toString should return a string (and not an array) so that it
// plays nicely with +.

Tensor.prototype.toString = function() {
  return 'Tensor([' + this.dims + '])';
};

Tensor.prototype.inspect = function() {
  if (this.length <= 25) {
    // TODO: Check the browserify shim for util works as expected.
    return inspect(this.toArray());
  } else {
    var arr = this.toFlatArray();
    return 'Tensor(' + inspect({
      dims: this.dims,
      mean: statistics.mean(arr),
      std: statistics.sd(arr),
      min: this.minreduce(),
      max: this.maxreduce(),
      allFinite: _.all(arr, _.isFinite)
    }) + ')';
  }
};

Tensor.prototype.logGamma = function() {
  var out = new Tensor(this.dims);
  var n = this.data.length;
  while (n--) {
    out.data[n] = special.logGamma(this.data[n]);
  }
  return out;
};

module.exports = Tensor;
