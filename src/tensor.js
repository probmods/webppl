'use strict';

var Tensor = require('adnn/tensor');
var special = require('./math/special');

Tensor.prototype.logGamma = function() {
  var out = new Tensor(this.dims);
  var n = this.data.length;
  while (n--) {
    out.data[n] = special.logGamma(this.data[n]);
  }
  return out;
};

module.exports = Tensor;
