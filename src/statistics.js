'use strict';

var _ = require('underscore');
var util = require('./util');
var assert = require('assert');

var abs = Math.abs,
    pow = Math.pow,
    sqrt = Math.sqrt,
    ln = Math.ln;

function expectation(a, func) {
  assert.ok(a.length > 0);
  var f = func || _.identity;
  return _.reduce(a, function(acc, x) {
    return acc + f(x);
  }, 0) / a.length;
}

// HT https://en.wikipedia.org/wiki/Digamma_function#Computation_and_approximation
var digamma = function(x) {
  if (x < 6)
    return digamma(x + 1) - 1 / x;

  return ln(x) -
      1 / (2 * x) -
      1 / (12 * pow(x, 2)) +
      1 / (120 * pow(x, 4)) -
      1 / (252 * pow(x, 6)) +
      1 / (240 * pow(x, 8)) -
      5 / (660 * pow(x, 10)) +
      691 / (32760 * pow(x, 12)) -
      1 / (12 * pow(x, 14));
}

// HT http://ms.mcmaster.ca/peter/s743/trigamma.html
// (cites formulas from abramowitz & stegun, which you can get at:
// http://people.math.sfu.ca/~cbm/aands/)
var trigamma = function(x) {
  if (x < 30) {
    return trigamma(x + 1) + 1 / (x * x);
  }

  return 1 / x +
      1 / (2 * pow(x, 2)) +
      1 / (6 * pow(x, 3)) -
      1 / (30 * pow(x, 5)) +
      1 / (42 * pow(x, 7)) -
      1 / (30 * pow(x, 9))
}

function mean(a) {
  return expectation(a)
}

function variance(a) {
  var m = expectation(a);
  return expectation(a, function(x) { return pow(x - m, 2) })
}

function sd(a) {
  return sqrt(variance(a));
}

function skew(a) {
  var m = mean(a);
  var s = sd(a);

  return expectation(a, function(x) { return pow((x - m) / s, 3) })
}

function kurtosis(a) {
  var m = mean(a);

  return expectation(a, function(x) { return pow((x - m), 4) }) /
      pow(expectation(a, function(x) { return pow((x - m), 2) }), 2);
}

function kde(samps, kernel) {
  if (kernel === undefined || typeof kernel !== 'function') {
    kernel = function(u) {
      return abs(u) <= 1 ? .75 * (1 - u * u) : 0;
    };
  }

  // get optimal bandwidth
  // HT http://en.wikipedia.org/wiki/Kernel_density_estimation#Practical_estimation_of_the_bandwidth
  var n = samps.length;
  var s = sd(samps);

  var bandwidth = 1.06 * s * pow(n, -0.2);

  var min = _.min(samps);
  var max = _.max(samps);

  var numBins = (max - min) / bandwidth;

  var results = [];

  for (var i = 0; i <= numBins; i++) {
    var x = min + bandwidth * i;
    var kernelSum = 0;
    for (var j = 0; j < samps.length; j++) {
      kernelSum += kernel((x - samps[j]) / bandwidth);
    }
    results.push({item: x, density: kernelSum / (n * bandwidth)});
  }
  return results;
}

// estimate the mode of a continuous distribution from some
// samples by computing kde and returning the bin with
// max density
function kdeMode(samps) {
  var kdeResults = kde(samps);

  var maxDensity = -Infinity;
  var maxItem;

  for (var i = 0, n = kdeResults.length; i < n; i++) {
    var item = kdeResults[i].item,
        density = kdeResults[i].density;

    if (density > maxDensity) {
      maxDensity = density;
      maxItem = item;
    }
  }
  return maxItem;
}

module.exports = {
  digamma: digamma,
  trigamma: trigamma,
  mean: mean,
  variance: variance,
  sd: sd,
  skew: skew,
  kurtosis: kurtosis,
  kde: kde,
  kdeMode: kdeMode
}
