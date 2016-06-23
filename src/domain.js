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

module.exports = {
  gt: gt,
  lt: lt,
  interval: interval
};
