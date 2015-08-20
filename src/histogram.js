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

module.exports = Histogram;
