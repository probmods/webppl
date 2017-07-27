'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var numeric = require('../math/numeric');
var Discrete = require('./discrete').Discrete;

function isContinuousDist(d) {
  return base.isDist(d) && d.isContinuous;
}

function supportEq(s1, s2) {
  return s1 === s2 ||
    (s1 !== undefined &&
     s2 !== undefined &&
     s1.lower === s2.lower &&
     s1.upper === s2.upper);
}

var Mixture = base.makeDistributionType({
  name: 'Mixture',
  desc: 'A finite mixture of continuous distributions. ' +
    'The component distributions should all share a common support.',
  params: [
    {
      name: 'dists',
      desc: 'array of component distributions'
    },
    {
      name: 'ps',
      desc: 'component probabilities (can be unnormalized)',
      type: types.nonNegativeVectorOrRealArray
    }
  ],
  wikipedia: false,
  mixins: [base.continuousSupport],
  constructor: function() {
    var dists = this.params.dists;
    var ps = this.params.ps;

    if (!_.isArray(dists)) {
      throw new Error('Parameter dists should be an array.');
    }

    if (dists.length !== ad.value(ps).length) {
      throw new Error('Parameters ps and dists should have the same length.');
    }

    if (dists.length === 0) {
      throw new Error('Parameters ps and dists should be non-empty.');
    }

    if (!_.every(dists, isContinuousDist)) {
      throw new Error('Parameter dists should be an array of continuous distributions.');
    }

    var support = dists[0].support && dists[0].support();
    for (var i = 1; i < dists.length; i++) {
      if (!supportEq(support, dists[i].support && dists[i].support())) {
        throw new Error('All distributions should have the same support.');
      }
    }
    this.support = support && _.constant(support);

    this.indicatorDist = new Discrete({ps: ps});
  },
  sample: function() {
    var i = this.indicatorDist.sample();
    return this.params.dists[i].sample();
  },
  score: function(val) {
    'use ad';
    var dists = this.params.dists;
    var s = -Infinity;
    for (var i = 0; i < dists.length; i++) {
      s = numeric.logaddexp(s, this.indicatorDist.score(i) + dists[i].score(val));
    }
    return s;
  }
});

module.exports = {
  Mixture: Mixture
};
