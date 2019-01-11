'use strict';

var logNormal = require('../../../src/dists/logNormal');
var util = require('../../../src/util');
var statistics = require('../../../src/math/statistics');

module.exports = {
  name: 'logNormal',
  sampler: logNormal.sample,
  inSupport: function(params, x) {
    return typeof x === 'number' && x >= 0 && x < Infinity;
  },
  settings: [
    {params: [0, 1], n: 1e05, abstol: {mode: 5}, skip: ['skew', 'kurtosis']},
    // expected variance is ginormous:
    {params: [0, 10], n: 1e05, abstol: {mode: 10}, skip: ['skew', 'kurtosis']},
    // mean is easily 40 digits:
    {params: [100, 1], n: 1e05, reltol: 0.1, skip: ['skew', 'kurtosis', 'mode']},
    {params: [-100, 1], n: 1e05, reltol: 0.1, skip: ['skew', 'kurtosis', 'mode']},
    // can check skew for low variance, extreme distributions:
    {params: [0, 1e-05], n: 1e05, reltol: {mode: 0.1}},
    {params: [100, 1e-05], n: 1e05, reltol: {mode: 0.1}},
    {params: [0, 0.1], n: 1e05, reltol: {mode: 0.1}},
    {params: [100, 0.1], n: 1e05, reltol: {mode: 0.1}},
  ],
  moment: function(params, n) {
    var mu = params[0];
    var sigma = params[1];
    // HT https://en.wikipedia.org/wiki/Log-normal_distribution#Arithmetic_moments
    return Math.exp(n * mu + 0.5 * n * n * sigma * sigma);
  },
  // HT https://en.wikipedia.org/wiki/Log-normal_distribution
  populationStatisticFunctions: {
    mean: function(params) {
      var mu = params[0];
      var sigma = params[1];
      return Math.exp(mu + 0.5 * sigma * sigma);
    },
    mode: function(params) {
      var mu = params[0];
      var sigma = params[1];
      return Math.exp(mu - sigma * sigma);
    },
    variance: function(params) {
      var mu = params[0];
      var sigma = params[1];
      return (
        (Math.exp(sigma * sigma) - 1) *
        (Math.exp(2 * mu + sigma * sigma))
      );
    },
    skew: function(params) {
      var sigma = params[1];
      return (
        (Math.exp(sigma * sigma) + 2) *
        Math.sqrt((Math.exp(sigma * sigma) - 1))
      );
    },
    kurtosis: function(params) {
      var sigma = params[1];
      return (
        (Math.exp(4 * sigma * sigma)) +
        (2 * Math.exp(3 * sigma * sigma)) +
        (3 * Math.exp(2 * sigma * sigma)) +
        (-3)
      );
    }
  }
}
