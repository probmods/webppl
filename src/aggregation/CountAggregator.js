'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var dists = require('../dists');

var CountAggregator = function(onlyMAP) {
  this.onlyMAP = onlyMAP;
  this.max = {value: undefined, score: -Infinity};
  this.samples = [];
};

CountAggregator.prototype.add = function(value, score) {
  score = (score === undefined) ? 0 : score;
  if (!this.onlyMAP) {
    this.samples.push({value: value, score: score});
  }
  if (score > this.max.score) {
    this.max.value = value;
    this.max.score = score;
  }
};

CountAggregator.prototype.toDist = function() {
  if (this.onlyMAP) {
    this.samples = [this.max];
  }
  return new dists.SampleBasedMarginal({
    samples: this.samples,
    numSamples: this.samples.length
  });
};

module.exports = CountAggregator;
