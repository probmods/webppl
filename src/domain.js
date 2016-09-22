'use strict';

function RealInterval(a, b) {
  this.a = a;
  this.b = b;
}

function gt(a) {
  return new RealInterval(a, Infinity);
}

function lt(b) {
  return new RealInterval(-Infinity, b);
}

function interval(a, b) {
  return new RealInterval(a, b);
}

function Simplex() {
}

var simplex = new Simplex();

module.exports = {
  RealInterval: RealInterval,
  gt: gt,
  lt: lt,
  interval: interval,
  simplex: simplex
};
