'use strict';

var assert = require('assert');
var _ = require('underscore');
var numeric = require('numeric');
var Tensor = require('../tensor');

// This implements the strategy used at [1] to generate an orthogonal
// matrix. It takes as input a (typically random) matrix and returns a
// matrix of the same shape.

// [1] https://github.com/Lasagne/Lasagne/blob/a3d44a7fbb84b1206a3959881c52b2203f48fc44/lasagne/init.py#L363

function ortho(t) {
  if (!(t instanceof Tensor) || (t.rank !== 2)) {
    throw new Error('Tensor with rank=2 (i.e. a matrix) expected.');
  }
  var height = t.dims[0];
  var width = t.dims[1];
  var iswide = height < width;
  var out = iswide ?
      svdU(t.transpose()).transpose() :
      svdU(t);
  assert.ok(_.isEqual(out.dims, t.dims));
  return out;
}

function svdU(t) {
  var U = numeric.svd(t.toArray()).U;
  return new Tensor([U.length, U[0].length]).fromArray(U);
}

module.exports = ortho;
