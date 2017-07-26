'use strict';
'use ad';

var assert = require('assert');
var _ = require('lodash');
var dists = require('../dists');
var util = require('../util');
var numeric = require('../math/numeric');

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
  var key = util.serialize(value);
  if (this.dist[key] === undefined) {
    this.dist[key] = { score: -Infinity, val: value };
  }
  this.dist[key].score = numeric.logaddexp(this.dist[key].score, score);
};

function normalize(dist) {
  // Note, this also maps dist from log space into probability space.
  var logNorm = _.reduce(dist, function(acc, obj) {
    return numeric.logaddexp(acc, obj.score);
  }, -Infinity);
  return _.mapValues(dist, function(obj) {
    return { val: obj.val, prob: Math.exp(obj.score - logNorm) };
  });
}

ScoreAggregator.prototype.toDist = function() {
  return new dists.Marginal({dist: normalize(this.dist)});
};

module.exports = ScoreAggregator;
