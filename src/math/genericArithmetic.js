// Generic (scalar/tensor) arithmetic operations.

'use strict';

var Tensor = require('../tensor');

function add(x, y) {
  if (x instanceof Tensor) {
    return x.add(y);
  } else if (typeof x === 'number') {
    return x + y;
  } else {
    throw new Error('add: unhandled types');
  }
}

function addEq(x, y) {
  if (x instanceof Tensor) {
    return x.addeq(y);
  } else if (typeof x === 'number') {
    return x + y;
  } else {
    throw new Error('addEq: unhandled types');
  }
}

function mul(x, y) {
  if (x instanceof Tensor) {
    return x.mul(y);
  } else if (typeof x === 'number') {
    return x * y;
  } else {
    throw new Error('mul: unhandled types');
  }
}

function sum(x) {
  if (x instanceof Tensor) {
    return x.sumreduce();
  } else if (typeof x === 'number') {
    return x;
  } else {
    throw new Error('sum: unhandled type');
  }
}

module.exports = {
  add: add,
  addEq: addEq,
  mul: mul,
  sum: sum
};
