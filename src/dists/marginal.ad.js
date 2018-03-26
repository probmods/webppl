'use strict';

var _ = require('lodash');
var assert = require('assert');
var util = require('../util');
var base = require('./base');

var Marginal = base.makeDistributionType({
  name: 'Marginal',
  nodoc: true,
  nohelper: true,
  params: [{name: 'dist'}],
  mixins: [base.finiteSupport],
  constructor: function() {
    'use ad';
    var norm = _.reduce(this.params.dist, function(acc, obj) {
      return acc + obj.prob;
    }, 0);
    assert.ok(Math.abs(1 - norm) < 1e-8, 'Expected marginal distribution to be normalized.');

    this.supp = _.map(this.params.dist, function(obj) {
      return obj.val;
    });

    this.getDist = function() {
      return this.params.dist;
    };
  },
  sample: function() {
    'use ad';
    var x = util.random();
    var dist = this.params.dist;
    var probAccum = 0;
    for (var i in dist) {
      if (dist.hasOwnProperty(i)) {
        probAccum += dist[i].prob;
        if (x < probAccum) {
          return dist[i].val;
        }
      }
    }
    return this.params.dist[i].val;
  },
  score: function(val) {
    'use ad';
    var obj = this.params.dist[util.serialize(val)];
    return obj ? Math.log(obj.prob) : -Infinity;
  },
  support: function() {
    return this.supp;
  },
  print: function() {
    return print(this.params.dist);
  }
});

function print(dist) {
  return 'Marginal:\n' + _.map(dist, function(obj, val) { return [val, obj.prob]; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .map(function(pair) { return '    ' + pair[0] + ' : ' + pair[1]; })
      .join('\n');
}

module.exports = {
  Marginal: Marginal,
  print: print
};
