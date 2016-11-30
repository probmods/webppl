'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var dists = require('../dists');

var CountAggregator = function() {
  this.hist = {};
};

CountAggregator.prototype.add = function(value) {
  var k = util.serialize(value);
  if (this.hist[k] === undefined) {
    this.hist[k] = { count: 0, val: value };
  }
  this.hist[k].count += 1;
};

function normalize(hist) {
  var totalCount = _.reduce(hist, function(acc, obj) {
    return acc + obj.count;
  }, 0);
  return {
    totalCount: totalCount,
    dist: _.mapObject(hist, function(obj) {
      return { val: obj.val, prob: obj.count / totalCount };
    })
  };
}

CountAggregator.prototype.toDist = function() {
  var normalized = normalize(this.hist);
  return new dists.Marginal({
    dist: normalized.dist,
    numSamples: normalized.totalCount
  });
};

module.exports = CountAggregator;
