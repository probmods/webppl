'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var Marginal = require('./marginal').Marginal;
var T = ad.tensor;

var Categorical = base.makeDistributionType({
  name: 'Categorical',
  desc: 'Distribution over elements of ``vs`` with ``P(vs[i])`` proportional to ``ps[i]``. ' +
    '``ps`` may be omitted, in which case a uniform distribution over ``vs`` is returned.',
  params: [
    {name: 'ps', desc: 'probabilities (can be unnormalized)',
      type: types.nonNegativeVectorOrRealArray, optional: true},
    {name: 'vs', desc: 'support', type: types.array(types.any)}],
  wikipedia: true,
  mixins: [base.finiteSupport],
  constructor: function() {
    'use ad';
    // Add default for ps when omitted.
    if (this.params.ps === undefined) {
      this.params = {
        ps: _.fill(Array(this.params.vs.length), 1),
        vs: this.params.vs
      };
    }
    var ps = this.params.ps;
    var vs = this.params.vs;
    if (vs.length !== ad.value(ps).length) {
      throw new Error('Parameters ps and vs should have the same length.');
    }
    if (vs.length === 0) {
      throw new Error('Parameters ps and vs should have length > 0.');
    }
    var dist = {};
    var norm = _.isArray(ps) ? numeric.sum(ps) : T.sumreduce(ps);
    for (var i in vs) {
      var val = vs[i];
      var k = util.serialize(val);
      if (!_.has(dist, k)) {
        dist[k] = {val: val, prob: 0};
      }
      dist[k].prob += (_.isArray(ps) ? ps[i] : T.get(ps, i)) / norm;
    }
    this.marginal = new Marginal({dist: dist});
  },
  sample: function() {
    return this.marginal.sample();
  },
  score: function(val) {
    return this.marginal.score(val);
  },
  support: function() {
    return this.marginal.support();
  }
});

module.exports = {
  Categorical: Categorical
};
