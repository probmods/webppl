'use strict';

var _ = require('lodash');
var base = require('./base');
var util = require('../util');
var marginal = require('./marginal');

// A "list of samples" backed marginal distribution that only
// aggregates the samples into a distribution when necessary.
var SampleBasedMarginal = base.makeDistributionType({
  name: 'SampleBasedMarginal',
  nodoc: true,
  nohelper: true,
  params: [{name: 'samples'}],
  mixins: [base.finiteSupport],
  constructor: function() {
    if (!_.isArray(this.params.samples) ||
        this.params.samples.length === 0) {
      throw new Error('Expected samples to be a non-empty array.');
    }

    // Provide access to the samples using the interface previously
    // provided by the `justSample` option.
    // samples is an array of objects like: {value: ..., score: ...}
    this.samples = this.params.samples;

    this.getDist = function() {
      if (this._cacheddist) {
        return this._cacheddist;
      } else {
        var dist = {};
        this.params.samples.forEach(function(obj) {
          var val = obj.value;
          var key = util.serialize(val);
          if (dist[key] === undefined) {
            dist[key] = {val: val, prob: 0};
          }
          dist[key].prob += 1;
        });
        // Normalize.
        var n = this.params.samples.length;
        _.each(dist, function(obj) { obj.prob /= n; });
        this._cacheddist = dist;
        return dist;
      }
    };
  },
  sample: function() {
    var n = this.params.samples.length;
    return this.params.samples[Math.floor(util.random() * n)].value;
  },
  score: function(val) {
    var key = util.serialize(val);
    var obj = this.getDist()[key];
    return (obj === undefined) ? -Infinity : Math.log(obj.prob);
  },
  support: function() {
    if (this.params.samples.length === 1) {
      // Optimization: Avoid unnecessary serialization in the
      // onlyMAP case
      return [this.params.samples[0].value];
    } else if (this._cachedsupport) {
      return this._cachedsupport;
    } else {
      var support = _.map(this.getDist(), _.property('val'));
      this._cachedsupport = support;
      return support;
    }
  },
  print: function() {
    return marginal.print(this.getDist());
  }
});

module.exports = {
  SampleBasedMarginal: SampleBasedMarginal
};
