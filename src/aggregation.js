'use strict';

var erp = require('./erp');
var util = require('./util');

var Histogram = function() {
  this.hist = {};
};

Histogram.prototype.add = function(value) {
  var k = JSON.stringify(value);
  if (this.hist[k] === undefined) {
    this.hist[k] = { prob: 0, val: value };
  }
  this.hist[k].prob += 1;
};

Histogram.prototype.toERP = function() {
  return erp.makeMarginalERP(util.logHist(this.hist));
};

var MAP = function(retainSamples) {
  this.max = { value: undefined, score: -Infinity };
  this.samples = [];
  this.retainSamples = retainSamples;
};

MAP.prototype.add = function(value, score) {
  if (this.retainSamples) {
    this.samples.push(value);
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

module.exports = {
  Histogram: Histogram,
  MAP: MAP
};
