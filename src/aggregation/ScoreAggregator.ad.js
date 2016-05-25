'use strict';
'use ad';

var assert = require('assert');
var _ = require('underscore');
var dists = require('../dists');
var util = require('../util');

function logsumexp(a, b) {
  assert.ok(a !== -Infinity || b !== -Infinity);
  var m = Math.max(a, b);
  return Math.log(Math.exp(a - m) + Math.exp(b - m)) + m;
}

var ScoreAggregator = function() {
  this.dist = {};
};

Object.defineProperties(ScoreAggregator.prototype, {
  size: { get: function() { return _.size(this.dist); } }
});

ScoreAggregator.prototype.add = function(value, score) {
  if (score === -Infinity) {
    return;
  }
  var k = util.serialize(value);
  if (this.dist[k] === undefined) {
    this.dist[k] = { score: -Infinity, val: value };
  }
  this.dist[k].score = logsumexp(this.dist[k].score, score);
};

function normalize(dist) {
  // Note, this also maps dist from log space into probability space.
  var logNorm = _.reduce(dist, function(acc, obj) {
    return logsumexp(acc, obj.score);
  }, -Infinity);
  return _.mapObject(dist, function(obj) {
    return { val: obj.val, prob: Math.exp(obj.score - logNorm) };
  });
}

ScoreAggregator.prototype.toDist = function() {
  return new dists.Marginal({dist: normalize(this.dist)});
};

module.exports = ScoreAggregator;
