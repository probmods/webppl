'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var numeric = require('../math/numeric');
var util = require('../util');
var Discrete = require('./discrete').Discrete;

function continuousSupportEq(s1, s2) {
  return s1 === s2 ||
    (s1 !== undefined &&
     s2 !== undefined &&
     s1.lower === s2.lower &&
     s1.upper === s2.upper);
}

function unionDiscreteSupports(supports) {
  return _.chain(supports)
    .flatten()
    .uniqWith(supportElemEq)
    .value();
}

function supportElemEq(x, y) {
  return util.serialize(x) === util.serialize(y);
}

var Mixture = base.makeDistributionType({
  name: 'Mixture',
  desc: 'A finite mixture of distributions. ' +
    'The component distributions should be either all discrete or all continuous. ' +
    'All continuous distributions should share a common support.',
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

    if (!_.every(dists, base.isDist)) {
      throw new Error('Parameter dists should be an array of distributions.');
    }

    this.isContinuous = dists[0].isContinuous;
    var support_0 = this.isContinuous ? dists[0].support && dists[0].support() : undefined;

    for (var i = 1; i < dists.length; i++) {
      var dist_i = dists[i];
      if (dist_i.isContinuous !== this.isContinuous) {
        throw new Error('Mixtures combining discrete and continuous distributions are not supported.');
      }
      if (this.isContinuous) {
        var support_i = dist_i.support && dist_i.support();
        if (!continuousSupportEq(support_0, support_i)) {
          throw new Error('All continuous distributions should have the same support.');
        }
      }
    }

    if (this.isContinuous) {
      this.support = support_0 && _.constant(support_0);
    } else {
      this.support = function() {
        return unionDiscreteSupports(_.invokeMap(dists, 'support'));
      };
    }

    this.indicatorDist = new Discrete({ps: ps}, true);
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
