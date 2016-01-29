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
    this.hist[k] = { count: 0, val: value };
  }
  this.hist[k].count += 1;
};

function normalizeHist(hist) {
  var totalCount = _.reduce(hist, function(acc, obj) {
    return acc + obj.count;
  }, 0);
  return _.mapObject(hist, function(obj) {
    return { val: obj.val, prob: obj.count / totalCount };
  });
}

Histogram.prototype.toERP = function() {
  return erp.makeMarginalERP(normalizeHist(this.hist));
};

var Distribution = function() {
  this.dist = {};
};

Object.defineProperties(Distribution.prototype, {
  size: { get: function() { return _.size(this.dist); } }
});

Distribution.prototype.add = function(value, score) {
  if (score === -Infinity) {
    return;
  }
  var k = util.serialize(value);
  if (this.dist[k] === undefined) {
    this.dist[k] = { score: -Infinity, val: value };
  }
  this.dist[k].score = util.logsumexp([this.dist[k].score, score]);
};

function normalizeDist(dist) {
  // Note, this also maps dist from log space into probability space.
  var logNorm = _.reduce(dist, function(acc, obj) {
    return util.logsumexp([acc, obj.score]);
  }, -Infinity);
  return _.mapObject(dist, function(obj) {
    return { val: obj.val, prob: Math.exp(obj.score - logNorm) };
  });
}

Distribution.prototype.toERP = function() {
  return erp.makeMarginalERP(normalizeDist(this.dist));
};

var MAP = function(retainSamples) {
  this.max = { value: undefined, score: -Infinity };
  this.samples = [];
  this.retainSamples = retainSamples;
};

MAP.prototype.add = function(value, score) {
  var value = untapify(value);
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
