'use strict';

var Tensor = require('adnn/tensor');
var special = require('./math/special');


// TODO: dim.length to rank
// Sum over rows of a matrix.
Tensor.prototype.sumreduce0 = function() {
  if (this.dims.length !== 2) {
    throw new Error('sumreduce0 is only implemented for matrices.');
  }
  var h = this.dims[0];
  var w = this.dims[1];
  var out = new Tensor([h, 1]);
  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      out.data[i] += this.data[i * w + j];
    }
  }
  return out;
};

//TODO why is it here..?
Tensor.prototype.logGamma = function() {
  var out = new Tensor(this.dims);
  var n = this.data.length;
  while (n--) {
    out.data[n] = special.logGamma(this.data[n]);
  }
  return out;
};

module.exports = Tensor;
