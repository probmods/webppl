'use strict';

var gammaCof = [
  76.18009172947146,
  -86.50532032941677,
  24.01409824083091,
  -1.231739572450155,
  0.1208650973866179e-2,
  -0.5395239384953e-5];

function logGamma(xx) {
  var x = xx - 1.0;
  var tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  var ser = 1.000000000190015;
  for (var j = 0; j <= 5; j++) {
    x += 1;
    ser += gammaCof[j] / x;
  }
  return -tmp + Math.log(2.5066282746310005 * ser);
}

// HT https://en.wikipedia.org/wiki/Digamma_function#Computation_and_approximation
function digamma(x) {
  if (x < 6) {
    return digamma(x + 1) - 1 / x;
  }
  return Math.log(x) -
      1 / (2 * x) -
      1 / (12 * Math.pow(x, 2)) +
      1 / (120 * Math.pow(x, 4)) -
      1 / (252 * Math.pow(x, 6)) +
      1 / (240 * Math.pow(x, 8)) -
      5 / (660 * Math.pow(x, 10)) +
      691 / (32760 * Math.pow(x, 12)) -
      1 / (12 * Math.pow(x, 14));
}

// HT http://ms.mcmaster.ca/peter/s743/trigamma.html
// (cites formulas from abramowitz & stegun, which you can get at:
// http://people.math.sfu.ca/~cbm/aands/)
function trigamma(x) {
  if (x < 30) {
    return trigamma(x + 1) + 1 / (x * x);
  }
  return 1 / x +
      1 / (2 * Math.pow(x, 2)) +
      1 / (6 * Math.pow(x, 3)) -
      1 / (30 * Math.pow(x, 5)) +
      1 / (42 * Math.pow(x, 7)) -
      1 / (30 * Math.pow(x, 9));
}

module.exports = {
  logGamma: logGamma,
  digamma: digamma,
  trigamma: trigamma
};
