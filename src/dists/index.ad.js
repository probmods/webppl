'use strict';

var _ = require('lodash');
var util = require('../util');
var base = require('./base');

var distributions = _.chain(
  [
    ['Bernoulli', require('./bernoulli')],
    ['Beta', require('./beta')],
    ['Binomial', require('./binomial')],
    ['Categorical', require('./categorical')],
    ['Cauchy', require('./cauchy')],
    ['Delta', require('./delta')],
    ['DiagCovGaussian', require('./diagCovGaussian')],
    ['Dirichlet', require('./dirichlet')],
    ['Discrete', require('./discrete')],
    ['Exponential', require('./exponential')],
    ['Gamma', require('./gamma')],
    ['Gaussian', require('./gaussian')],
    ['ImproperUniform', require('./improperUniform')],
    ['IspNormal', require('./ispNormal')],
    ['KDE', require('./kde')],
    ['Laplace', require('./laplace')],
    ['LogisticNormal', require('./logisticNormal')],
    ['LogitNormal', require('./logitNormal')],
    ['Marginal', require('./marginal')],
    ['Mixture', require('./mixture')],
    ['Multinomial', require('./multinomial')],
    ['MultivariateBernoulli', require('./multivariateBernoulli')],
    ['MultivariateGaussian', require('./multivariateGaussian')],
    ['Poisson', require('./poisson')],
    ['RandomInteger', require('./randomInteger')],
    ['SampleBasedMarginal', require('./sampleBasedMarginal')],
    ['TensorGaussian', require('./tensorGaussian')],
    ['TensorLaplace', require('./tensorLaplace')],
    ['Uniform', require('./uniform')],
  ]).fromPairs()
    .mapValues(function(module, name) {
      return module[name];
    })
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
