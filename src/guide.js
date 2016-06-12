var assert = require('assert');
var _ = require('underscore');
var util = require('./util');
var Tensor = require('./tensor');
var ad = require('./ad');
var dists = require('./dists');
var gt = require('./domain').gt;

var T = ad.tensor;

// This function specifies an appropriate guide distribution for the
// given target distribution. This specification is abstract, given in
// terms of the distribution type, and a description of the parameters
// required to use this type as a guide. It's left to callers to
// generate suitable parameters and instantiate the distribution.

// For example:

// spec(Gaussian({mu: 0, sigma: 1}))
//
// =>
//
// {
//   type: Gaussian,
//   params: {
//     mu: {dims: [1]},
//     sigma: {dims: [1], domain: [0, Infinity]}
//   }
// }

// Note that all parameters described are tensors. If a distribution
// is parameterized by a scalar then the spec includes a tensor with
// dims=[1] for that parameter. It is the responsibility of callers to
// turn this back into a scalar before use.

// TODO: Cache the result? Since the dimension isn't part of the type
// we'd have to use a key based on both the type and the dimension of
// the target distribution. Note that we don't have a standard way to
// talk about the dimension of a distribution.

// TODO: Better name?
function spec(targetDist) {
  // TODO: Add custom logic for MultivariateGaussian. Uniform?
  if (targetDist instanceof dists.Dirichlet) {
    return dirichletSpec(targetDist);
  } else {
    return defaultSpec(targetDist);
  }
}

function defaultSpec(targetDist) {
  var paramSpec = _.map(targetDist.meta.params, function(paramMeta) {

    var name = paramMeta.name;
    var targetParam = ad.value(targetDist.params[name]);

    var dims;
    if (targetParam instanceof Tensor) {
      dims = targetParam.dims;
    } else if (_.isNumber(targetParam)) {
      dims = [1];
    } else {
      throw new Error('Cannot generate guide distribution for ' + targetDist);
    }

    return [name, {dims: dims, domain: paramMeta.domain}];

  });

  return {
    type: targetDist.constructor,
    params: _.object(paramSpec)
  };
}

function dirichletSpec(targetDist) {
  var d = ad.value(targetDist.params.alpha).length - 1;
  return {
    type: dists.LogisticNormal,
    params: {
      mu: {dims: [d, 1]},
      sigma: {dims: [d, 1], domain: gt(0)}
    }
  };
}

function softplus(x) {
  return T.log(T.add(T.exp(x), 1));
}

// TODO: Memoize? (How would doing so interact with daipp?)

// (Note that a and b can be ±Infinity. Caution required if using JSON
// serialization.)

// Returns a function that maps a (potentially lifted) tensor of
// (unbounded) reals to the interval [a,b] element-wise.
function squishFn(a, b) {
  if (a === -Infinity) {
    return function(x) {
      var y = softplus(x);
      return T.add(T.neg(y), b);
    };
  } else if (b === Infinity) {
    return function(x) {
      var y = softplus(x);
      return T.add(y, a);
    };
  } else {
    return function(x) {
      var y = T.sigmoid(x);
      return T.add(T.mul(y, b - a), a);
    };
  }
}

module.exports = {
  spec: spec,
  squishFn: squishFn
};
