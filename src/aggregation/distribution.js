'use strict';

var assert = require('assert');
var _ = require('underscore');
var erp = require('../erp');
var util = require('../util');
var ad = require('../ad');

function logsumexp(a, b) {
  assert.ok(ad.untapify(a) !== -Infinity || ad.untapify(b) !== -Infinity);
  var m = ad.maths.max(a, b);
  return ad.add(ad.maths.log(ad.add(ad.maths.exp(ad.sub(a, m)), ad.maths.exp(ad.sub(b, m)))), m);
}

var Distribution = function() {
  this.dist = {};
};

Object.defineProperties(Distribution.prototype, {
  size: { get: function() { return _.size(this.dist); } }
});

Distribution.prototype.add = function(value, score) {
  if (ad.untapify(score) === -Infinity) {
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
    return { val: obj.val, prob: ad.maths.exp(ad.sub(obj.score, logNorm)) };
  });
}

Distribution.prototype.toERP = function() {
  return erp.makeMarginalERP(normalize(this.dist));
};

module.exports = Distribution;
