'use strict';

var _ = require('underscore');
var erp = require('./erp');
var util = require('./util');
var ad = require('./ad');

var Histogram = function() {
  this.hist = {};
};

Histogram.prototype.add = function(value) {
  var value = untapify(value);
  var k = util.serialize(value);
  if (this.hist[k] === undefined) {
    this.hist[k] = { prob: 0, val: value };
  }
  this.hist[k].prob += 1;
};

Histogram.prototype.toERP = function() {
  return erp.makeMarginalERP(util.logHist(this.hist));
};

var Distribution = function() {
  this.dist = {};
};

Distribution.prototype.add = function(value, score) {
  var k = util.serialize(value);
  if (this.dist[k] === undefined) {
    this.dist[k] = { prob: -Infinity, val: value };
  }
  this.dist[k].prob = util.logsumexp([this.dist[k].prob, score]);
};

Distribution.prototype.toERP = function() {
  return erp.makeMarginalERP(this.dist);
};

var MAP = function(retainSamples) {
  this.max = { value: undefined, score: -Infinity };
  this.samples = [];
  this.retainSamples = retainSamples;
};

MAP.prototype.add = function(value, score) {
  var value = untapify(value);
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

// Recursively untapify objects. ad.js already does this for arrays,
// here we extend that to other objects.
function untapify(x) {
  if (_.isObject(x) && !_.isArray(x) && !ad.isTape(x)) {
    return _.mapObject(x, untapify);
  } else {
    return ad.untapify(x);
  }
}

module.exports = {
  Histogram: Histogram,
  Distribution: Distribution,
  MAP: MAP
};
