'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var Histogram = require('./histogram');

var MAP = function(retainSamples) {
  this.max = { value: undefined, score: -Infinity };
  this.samples = [];
  this.retainSamples = retainSamples;
};

MAP.prototype.add = function(value, score) {
  var value = ad.deepUntapify(value);
  var score = ad.untapify(score);
  if (this.retainSamples) {
    this.samples.push({ value: value, score: score });
  }
  if (score > this.max.score) {
    this.max.value = value;
    this.max.score = score;
  }
};

MAP.prototype.toERP = function() {
  var hist = new Histogram();
  hist.add(this.max.value);
  var erp = hist.toERP();
  if (this.retainSamples) {
    erp.samples = this.samples;
  }
  return erp;
};

module.exports = MAP;
