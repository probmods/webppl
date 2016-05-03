'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var erp = require('../erp');

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
  return _.mapObject(hist, function(obj) {
    return { val: obj.val, prob: obj.count / totalCount };
  });
}

CountAggregator.prototype.toERP = function() {
  return new erp.marginal({dist: normalize(this.hist)});
};

module.exports = CountAggregator;
