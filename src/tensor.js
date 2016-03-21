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

// Transpose.
// Do the conservative thing, and return a copy for now.
Tensor.prototype.T = function() {
  assert.ok(this.rank === 2);
  var h = this.dims[0];
  var w = this.dims[1];
  var y = new Tensor([w, h]);
  for (var i = 0; i < h; i++) {
    for (var j = 0; j < w; j++) {
      y.data[j * h + i] = this.data[i * w + j];
    }
  }
  return y;
};

Tensor.prototype.diag = function() {
  assert.ok(this.rank === 2);
  assert.ok(this.dims[1] === 1);
  var n = this.dims[0];
  var y = new Tensor([n, n]);
  for (var i = 0; i < n; i++) {
    y.data[i * (n + 1)] = this.data[i];
  }
  return y;
};

// Matrix inverse.
// Ported from numeric.js.
Tensor.prototype.inv = function() {

  assert.ok(this.rank === 2);
  assert.ok(this.dims[0] === this.dims[1]);
  var n = this.dims[0];

  var Ai, Aj;
  var Ii, Ij;
  var i, j, k, x;

  var A = [];
  for (i = 0; i < n; i++) {
    Ai = new Float64Array(n);
    A.push(Ai);
    for (j = 0; j < n; j++) {
      Ai[j] = this.data[i * n + j];
    }
  }

  // Not using Float64 here as I want the convinience of passing I to
  // fromArray() which doesn't currently work with Float64Array.
  var I = [];
  for (i = 0; i < n; i++) {
    Ii = new Array(n);
    I.push(Ii);
    for (j = 0; j < n; j++) {
      Ii[j] = i === j ? 1 : 0;
    }
  }

  for (j = 0; j < n; ++j) {
    var i0 = -1;
    var v0 = -1;
    for (i = j; i !== n; ++i) {
      k = Math.abs(A[i][j]);
      if (k > v0) {
        i0 = i; v0 = k;
      }
    }
    Aj = A[i0];
    A[i0] = A[j];
    A[j] = Aj;
    Ij = I[i0];
    I[i0] = I[j];
    I[j] = Ij;
    x = Aj[j];
    for (k = j; k !== n; ++k) {
      Aj[k] /= x;
    }
    for (k = n - 1; k !== -1; --k) {
      Ij[k] /= x;
    }
    for (i = n - 1; i !== -1; --i) {
      if (i !== j) {
        Ai = A[i];
        Ii = I[i];
        x = Ai[j];
        for (k = j + 1; k !== n; ++k) {
          Ai[k] -= Aj[k] * x;
        }
        for (k = n - 1; k > 0; --k) {
          Ii[k] -= Ij[k] * x;
          --k;
          Ii[k] -= Ij[k] * x;
        }
        if (k === 0) {
          Ii[0] -= Ij[0] * x;
        }
      }
    }
  }
  return new Tensor([n, n]).fromArray(I);
};

// Determinant.
// Ported from numeric.js.
Tensor.prototype.det = function() {
  assert.ok(this.rank === 2);
  assert.ok(this.dims[0] === this.dims[1]);
  var n = this.dims[0];
  var ret = 1;

  var i, j, k;
  var Aj, Ai, alpha, temp, k1, k2, k3;

  var A = [];
  for (i = 0; i < n; i++) {
    Ai = new Float64Array(n);
    A.push(Ai);
    for (j = 0; j < n; j++) {
      Ai[j] = this.data[i * n + j];
    }
  }

  for (j = 0; j < n - 1; j++) {
    k = j;
    for (i = j + 1; i < n; i++) {
      if (Math.abs(A[i][j]) > Math.abs(A[k][j])) {
        k = i;
      }
    }
    if (k !== j) {
      temp = A[k];
      A[k] = A[j];
      A[j] = temp;
      ret *= -1;
    }
    Aj = A[j];
    for (i = j + 1; i < n; i++) {
      Ai = A[i];
      alpha = Ai[j] / Aj[j];
      for (k = j + 1; k < n - 1; k += 2) {
        k1 = k + 1;
        Ai[k] -= Aj[k] * alpha;
        Ai[k1] -= Aj[k1] * alpha;
      }
      if (k !== n) {
        Ai[k] -= Aj[k] * alpha;
      }
    }
    if (Aj[j] === 0) {
      return 0;
    }
    ret *= Aj[j];
  }
  return ret * A[j][j];
};

Tensor.prototype.dot = function(t) {

  var a = this, b = t;
  assert.ok(a.rank === 2 && b.rank === 2, 'Inputs to dot should have rank = 2.');
  assert.ok(a.dims[1] === b.dims[0], 'Dimension mismatch for ' + a + ' and ' + b);

  var l = a.dims[1];
  var h = a.dims[0], w = b.dims[1];
  var y = new Tensor([h, w]);

  for (var r = 0; r < h; r++) {
    for (var c = 0; c < w; c++) {
      var z = 0;
      for (var i = 0; i < l; i++) {
        z += a.data[r * l + i] * b.data[w * i + c];
      }
      y.data[r * w + c] = z;
    }
  }
  return y;
};

Tensor.prototype.cholesky = function() {
  var a = this;
  assert.ok((a.rank === 2) && (a.dims[0] === a.dims[1]),
            'cholesky is only defined for square matrices.');

  // If a isn't positive-definite then the result will silently
  // include NaNs, no warning is given.

  var s;
  var n = a.dims[0];
  var L = new Tensor([n, n]);

  for (var i = 0; i < n; i++) {
    for (var j = 0; j <= i; j++) {
      s = 0;
      for (var k = 0; k < j; k++) {
        s += L.data[i * n + k] * L.data[j * n + k];
      }
      L.data[i * n + j] = (i === j) ?
          Math.sqrt(a.data[i * n + i] - s) :
          1 / L.data[j * n + j] * (a.data[i * n + j] - s);
    }
  }

  return L;
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
