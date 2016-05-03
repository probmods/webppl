'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var CountAggregator = require('../aggregation/CountAggregator');

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

MaxAggregator.prototype.toERP = function() {
  var hist = new CountAggregator();
  hist.add(this.max.value);
  var erp = hist.toERP();
  if (this.retainSamples) {
    erp.samples = this.samples;
  }
  return erp;
};

module.exports = MaxAggregator;
