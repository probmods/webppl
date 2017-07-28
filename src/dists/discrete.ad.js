'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var T = ad.tensor;

function sample(theta, thetaSum) {
  if (thetaSum === undefined) {
    thetaSum = numeric._sum(theta);
  }
  var x = util.random() * thetaSum;
  var k = theta.length;
  var probAccum = 0;
  for (var i = 0; i < k; i++) {
    probAccum += theta[i];
    if (x < probAccum) {
      return i;
    }
  }
  return k - 1;
}

function scoreVector(val, probs, norm) {
  'use ad';
  return Math.log(T.get(probs, val) / norm);

}

function scoreArray(val, probs, norm) {
  'use ad';
  return Math.log(probs[val] / norm);
}

function inSupport(val, dim) {
  return (val === Math.floor(val)) && (0 <= val) && (val < dim);
}

// Extracts an array of values from a (possibly lifted) tensor or an
// array (whose contents maybe lifted).
function toUnliftedArray(x) {
  return _.isArray(x) ? x.map(ad.value) : ad.value(x).data;
}

var Discrete = base.makeDistributionType({
  name: 'Discrete',
  desc: 'Distribution over ``{0,1,...,ps.length-1}`` with P(i) proportional to ``ps[i]``',
  params: [
    {name: 'ps', desc: 'probabilities (can be unnormalized)', type: types.nonNegativeVectorOrRealArray}
  ],
  wikipedia: 'Categorical_distribution',
  mixins: [base.finiteSupport],
  constructor: function() {
    // Compute the norm here, as it's required for both sampling and
    // scoring.
    if (_.isArray(this.params.ps)) {
      this.norm = numeric.sum(this.params.ps);
      this.scoreFn = scoreArray;
      this.dim = this.params.ps.length;
    }
    else {
      this.norm = T.sumreduce(this.params.ps);
      this.scoreFn = scoreVector;
      this.dim = ad.value(this.params.ps).length;
    }
  },
  sample: function() {
    return sample(toUnliftedArray(this.params.ps), ad.value(this.norm));
  },
  score: function(val) {
    if (inSupport(val, this.dim)) {
      return this.scoreFn(val, this.params.ps, this.norm);
    }
    else {
      return -Infinity;
    }
  },
  support: function() {
    return _.range(this.dim);
  }
});

module.exports = {
  Discrete: Discrete,
  sample: sample
};
