'use strict';

var assert = require('assert');
var _ = require('lodash');
var util = require('../util');
var ad = require('../ad');
var dists = require('../dists');

var CountAggregator = function(onlyMAP) {
  this.onlyMAP = onlyMAP;
  this.max = {value: undefined, score: -Infinity};
  this.samples = [];
};

CountAggregator.prototype.add = function(value, score) {
  if (this.onlyMAP) {
    assert.ok(score !== undefined, 'A score is required to compute the MAP.');
    if (score > this.max.score) {
      this.max.value = value;
      this.max.score = score;
    }
  } else {
    var obj = (score === undefined) ?
        {value: value} :
        {value: value, score: score};
    this.samples.push(obj);
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
