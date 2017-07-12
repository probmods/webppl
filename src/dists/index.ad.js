'use strict';

var _ = require('lodash');
var util = require('../util');
var base = require('./base');

var distributionNames = [
  'Bernoulli',
  'Beta',
  'Binomial',
  'Categorical',
  'Cauchy',
  'Delta',
  'DiagCovGaussian',
  'Dirichlet',
  'Discrete',
  'Exponential',
  'Gamma',
  'Gaussian',
  'ImproperUniform',
  'IspNormal',
  'KDE',
  'Laplace',
  'LogisticNormal',
  'LogitNormal',
  'Marginal',
  'Multinomial',
  'MultivariateBernoulli',
  'MultivariateGaussian',
  'Poisson',
  'RandomInteger',
  'SampleBasedMarginal',
  'TensorGaussian',
  'TensorLaplace',
  'Uniform'
];

var distributions = _.chain(distributionNames)
    .map(function(name) {
      return [name, require('./' + _.camelCase(name))[name]];
    })
    .fromPairs()
    .value();

function metadata() {
  return _.chain(distributions)
      .toPairs() // pair[0] = key, pair[1] = value
      .sortBy(function(pair) { return pair[0]; })
      .map(function(pair) { return pair[1]; })
      .map(function(dist) { return dist.prototype.meta; })
      .value();
}

var wpplFns = _.chain(distributions)
    .mapValues(function(ctor) {
      return function(s, k, a, params) {
        if (arguments.length > 4) {
          throw new Error('Too many arguments. Distributions take at most one argument.');
        }
        return k(s, new ctor(params));
      };
    })
    .mapKeys(function(ctor, name) {
      return 'make' + name;
    })
    .value();

var serialize = function(dist) {
  return util.serialize(dist);
};

var deserialize = function(JSONString) {
  var obj = util.deserialize(JSONString);
  if (!obj.probs || !obj.support) {
    throw new Error('Cannot deserialize a non-distribution JSON object: ' + JSONString);
  }
  return new distributions.Categorical({ps: obj.probs, vs: obj.support});
};

module.exports = _.assign({
  metadata: metadata,
  isDist: base.isDist,
  clone: base.clone,
  serialize: serialize,
  deserialize: deserialize
}, distributions, wpplFns);
