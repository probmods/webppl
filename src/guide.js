'use strict';

var assert = require('assert');
var _ = require('underscore');
var util = require('./util');
var Tensor = require('./tensor');
var ad = require('./ad');
var dists = require('./dists');
var gt = require('./domain').gt;

var T = ad.tensor;

// Returns an independent guide distribution for the given target
// distribution, sample address pair. Guiding all choices with
// independent guide distributions and optimizing the elbo yields
// mean-field variational inference.
function independent(targetDist, sampleAddress, env) {

  // Include the distribution name in the guide parameter name to
  // avoid collisions when the distribution type changes between
  // calls. (As a result of the distribution passed depending on a
  // random choice.)
  var relativeAddress = util.relativizeAddress(env, sampleAddress);
  var baseName = relativeAddress + '$mf$' + targetDist.meta.name + '$';

  var distSpec = spec(targetDist);

  var guideParams = _.mapObject(distSpec.params, function(paramSpec, paramName) {

    var dims = paramSpec.dims; // e.g. [2, 1]
    var domain = paramSpec.domain; // e.g. new RealInterval(0, Infinity)

    var name = baseName + paramName;
    var param = registerParam(env, name, paramSpec.dims);

    // Apply squishing.
    if (domain) {
      // Assume that domain is a RealInterval.
      param = squishFn(domain.a, domain.b)(param);
    }

    // Collapse tensor with dims=[1] to scalar.
    if (dims.length === 1 && dims[0] === 1) {
      param = ad.tensorEntry(param, 0);
    }

    return param;

  });

  return new distSpec.type(guideParams);

}

function registerParam(env, name, dims) {
  return util.registerParams(env, name, function() {
    return [new Tensor(dims)];
  })[0];
}

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

function spec(targetDist) {
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
  independent: independent
};
