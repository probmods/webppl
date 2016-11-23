'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var dists = require('../dists');

var MaxAggregator = function(retainSamples) {
  this.max = { value: undefined, score: -Infinity };
  this.samples = [];
  this.retainSamples = retainSamples;
};

MaxAggregator.prototype.add = function(value, score) {
  if (this.retainSamples) {
    this.samples.push({ value: value, score: score });
  }
  if (score > this.max.score) {
    this.max.value = value;
    this.max.score = score;
  }
};

MaxAggregator.prototype.toDist = function() {
  var dist = new dists.MAP({ val: this.max.value });
  if (this.retainSamples) {
    dist.samples = this.samples;
  }
  return dist;
};

module.exports = MaxAggregator;
