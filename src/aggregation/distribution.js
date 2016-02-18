'use strict';

var _ = require('underscore');
var erp = require('../erp');
var util = require('../util');

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

function normalize(dist) {
  // Note, this also maps dist from log space into probability space.
  var logNorm = _.reduce(dist, function(acc, obj) {
    return util.logsumexp([acc, obj.score]);
  }, -Infinity);
  return _.mapObject(dist, function(obj) {
    return { val: obj.val, prob: Math.exp(obj.score - logNorm) };
  });
}

Distribution.prototype.toERP = function() {
  return erp.makeMarginalERP(normalize(this.dist));
};

module.exports = Distribution;
