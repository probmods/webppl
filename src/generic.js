'use strict';

var assert = require('assert');
var _ = require('underscore');
var Tensor = require('./tensor');

// Polymorphic functions to simplify dealing with scalars and
// tensors. How much of an overhead would treating all params as
// Tensors introduce?

function allZero(x) {
  return _.isNumber(x) ? x === 0 : !x.anyreduce();
}

function zerosLike(x) {
  return _.isNumber(x) ? 0 : new Tensor(x.dims);
}

function onesLike(x) {
  return _.isNumber(x) ? 1 : new Tensor(x.dims).fill(1);
}

function add(a, b) {
  assert.ok(
      _.isNumber(a) && _.isNumber(b) ||
      a instanceof Tensor && b instanceof Tensor);
  return _.isNumber(a) ? a + b : a.add(b);
}

function sub(a, b) {
  assert.ok(
      _.isNumber(a) && _.isNumber(b) ||
      a instanceof Tensor && b instanceof Tensor);
  return _.isNumber(a) ? a - b : a.sub(b);
}

function mul(a, b) {
  assert.ok(
      _.isNumber(a) && _.isNumber(b) ||
      a instanceof Tensor && b instanceof Tensor);
  return _.isNumber(a) ? a * b : a.mul(b);
}

function div(a, b) {
  assert.ok(
      _.isNumber(a) && _.isNumber(b) ||
      a instanceof Tensor && b instanceof Tensor);
  return _.isNumber(a) ? a / b : a.div(b);
}

function scalarAdd(a, b) {
  assert.ok(_.isNumber(b));
  return _.isNumber(a) ? a + b : a.add(b);
}

function scalarMul(a, b) {
  assert.ok(_.isNumber(b));
  return _.isNumber(a) ? a * b : a.mul(b);
}

function scalarDiv(a, b) {
  assert.ok(_.isNumber(b));
  return _.isNumber(a) ? a / b : a.div(b);
}

function sqrt(a) {
  return _.isNumber(a) ? Math.sqrt(a) : a.sqrt();
}

module.exports = {
  allZero: allZero,
  zerosLike: zerosLike,
  onesLike: onesLike,
  add: add,
  sub: sub,
  mul: mul,
  div: div,
  scalarAdd: scalarAdd,
  scalarMul: scalarMul,
  scalarDiv: scalarDiv,
  sqrt: sqrt
};
