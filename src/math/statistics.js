'use strict';

var _ = require('lodash');
var assert = require('assert');
var util = require('../util');

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

function mode(samps) {
  // tally values and sort
  var tallied = _.sortBy(_.toPairs(_.countBy(samps)), '1');
  var last = _.last(tallied);
  if (tallied.length > 1) {
    var penultimate = tallied.slice(-2)[0];
    if (penultimate[1] === last[1]) {
      util.warn('Samples have more than one mode.');
    }
  }
  return last[0];
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
  mean: mean,
  variance: variance,
  sd: sd,
  skew: skew,
  kurtosis: kurtosis,
  kde: kde,
  kdeMode: kdeMode,
  mode: mode
}
