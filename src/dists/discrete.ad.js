'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var numeric = require('../math/numeric');
var T = ad.tensor;

function sample(theta) {
  var thetaSum = numeric._sum(theta);
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

function score(ps, i) {
  var scoreFn = _.isArray(ps) ? scoreArray : scoreVector;
  return scoreFn(ps, i);
}

function scoreVector(probs, val) {
  'use ad';
  var _probs = ad.value(probs);
  var d = _probs.dims[0];
  return inSupport(val, d) ?
      Math.log(T.get(probs, val) / T.sumreduce(probs)) :
      -Infinity;
}

function scoreArray(probs, val) {
  'use ad';
  var d = probs.length;
  return inSupport(val, d) ? Math.log(probs[val] / numeric.sum(probs)) : -Infinity;
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
  sample: function() {
    return sample(toUnliftedArray(this.params.ps));
  },
  score: function(val) {
    return score(this.params.ps, val);
  },
  support: function() {
    // This does the right thing for arrays and vectors.
    return _.range(ad.value(this.params.ps).length);
  }
});

module.exports = {
  Discrete: Discrete,
  sample: sample
};
