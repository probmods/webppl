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
  // FIXME: Is this good enough, or do we either need to have all
  // sampling coroutines compute scores, or do something different for
  // those that don't? See forward, rejection, pmcmc, asyncpf.
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
