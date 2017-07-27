'use strict';

var _ = require('lodash');
var util = require('./util');
var Tensor = require('./tensor');
var ad = require('./ad');
var dists = require('./dists');
var params = require('./params/params');
var numeric = require('./math/numeric');

var T = ad.tensor;

function notAllowed(fn) {
  return function() {
    throw new Error(fn + ' cannot be used within the guide.');
  };
}

var sampleNotAllowed = notAllowed('sample');
var factorNotAllowed = notAllowed('factor');

function guideCoroutine(env) {
  return {
    sample: sampleNotAllowed,
    factor: factorNotAllowed,
    incrementalize: env.defaultCoroutine.incrementalize,
    oldCoroutine: env.coroutine,
    // A flag used when creating parameters to check whether we're in
    // a guide thunk. Note that this does the right thing if Infer is
    // used within a guide. This can be checked from a webppl program
    // using the `inGuide()` helper.
    _guide: true
  };
}

function runInCoroutine(coroutine, env, k, f) {
  var prevCoroutine = env.coroutine;
  env.coroutine = coroutine;
  return f(function(s, val) {
    env.coroutine = prevCoroutine;
    return k(s, val);
  });
}

function runThunk(thunk, env, s, a, k) {
  if (!_.isFunction(thunk)) {
    throw new Error('The guide is expected to be a function.');
  }
  // Run the thunk with the guide coroutine installed. Check the
  // return value is a distribution before continuing.
  return runInCoroutine(
      guideCoroutine(env),
      env, k,
      function(k) {
        return thunk(s, function(s2, val) {
          // Clear the stack now the thunk has returned.
          return function() {
            return k(s2, val);
          };
        }, a + '_guide');
      });
}

function runDistThunk(thunk, env, s, a, k) {
  return runThunk(thunk, env, s, a, function(s2, dist) {
    if (!dists.isDist(dist)) {
      throw new Error('The guide did not return a distribution.');
    }
    return k(s2, dist);
  });
}

function runDistThunkCond(s, k, a, env, maybeThunk, alternate) {
  return maybeThunk ?
      runDistThunk(maybeThunk, env, s, a, k) :
      alternate(s, k, a);
}

// Runs the guide thunk passed to a `sample` statement, and returns
// the guide distribution returned by the thunk. When no guide is
// given, then the 'noAutoGuide' flag determines whether to
// automatically generate a suitable guide distribution or return
// `null`.
function getDist(maybeThunk, noAutoGuide, targetDist, env, s, a, k) {
  return runDistThunkCond(s, k, a, env, maybeThunk, function(s, k, a) {
    return k(s, noAutoGuide ? null : independent(targetDist, a, env));
  });
}

// Returns an independent guide distribution for the given target
// distribution, sample address pair. Guiding all choices with
// independent guide distributions and optimizing the elbo yields
// mean-field variational inference.

function independent(targetDist, sampleAddress, env) {

  util.warn('Using the default guide distribution for one or more choices.', true);

  // Include the distribution name in the guide parameter name to
  // avoid collisions when the distribution type changes between
  // calls. (As a result of the distribution passed depending on a
  // random choice.)
  var relativeAddress = util.relativizeAddress(params.baseAddress(env), sampleAddress);
  var baseName = relativeAddress + '$mf$' + targetDist.meta.name + '$';

  var distSpec = spec(targetDist);

  var guideParams = _.mapValues(distSpec.params, function(spec, name) {

    return _.has(spec, 'param') ?
        makeParam(spec.param, name, baseName, env) :
        spec.const;

  });

  return new distSpec.type(guideParams);

}

function makeParam(paramSpec, paramName, baseName, env) {
  var dims = paramSpec.dims; // e.g. [2, 1]
  var squish = paramSpec.squish;
  var name = baseName + paramName;

  var param = registerParam(env, name, dims);

  // Apply squishing.
  if (squish) {
    param = squish(param);
  }

  // Collapse tensor with dims=[1] to scalar.
  if (dims.length === 1 && dims[0] === 1) {
    param = ad.tensor.get(param, 0);
  }

  return param;
}

function registerParam(env, name, dims) {
  if (!params.exists(name)) {
    params.create(name, new Tensor(dims));
  }
  return params.fetch(name, env);
}

// This function generates a description of the guide distribution
// required for the given target distribution.

// It includes the type of the guide distribution, and information
// about how to map optimizable parameters to the parameters of the
// guide distribution.

// Note that guide parameters are always tensors. If a distribution
// has a scalar parameter then a guide parameter with dims=[1] is
// used. The `independent` function takes care of turning this back
// into a scalar before it is passed to the distribution.

function spec(targetDist) {
  if (targetDist instanceof dists.Dirichlet) {
    return dirichletSpec(targetDist);
  } else if (targetDist instanceof dists.TensorGaussian) {
    return tensorGaussianSpec(targetDist);
  } else if (targetDist instanceof dists.Uniform) {
    return uniformSpec(targetDist);
  } else if (targetDist instanceof dists.Gamma) {
    return gammaSpec(targetDist);
  } else if (targetDist instanceof dists.Beta) {
    return betaSpec(targetDist);
  } else if (targetDist instanceof dists.Discrete) {
    return discreteSpec(ad.value(targetDist.params.ps).length);
  } else if (targetDist instanceof dists.RandomInteger) {
    return discreteSpec(targetDist.params.n);
  } else if (targetDist instanceof dists.Binomial) {
    return discreteSpec(targetDist.params.n + 1);
  } else if (targetDist instanceof dists.MultivariateGaussian ||
             targetDist instanceof dists.Mixture ||
             targetDist instanceof dists.Marginal ||
             targetDist instanceof dists.SampleBasedMarginal) {
    throwAutoGuideError(targetDist);
  } else {
    return defaultSpec(targetDist);
  }
}

function throwAutoGuideError(targetDist) {
  var msg = 'Cannot automatically generate a guide for a ' +
      targetDist.meta.name + ' distribution.';
  throw new Error(msg);
}

// The default is a guide of the same type as the target. We determine
// the dimension of the parameters by looking at the target
// distribution instance, and get information about their domain from
// the distribution meta-data.
function defaultSpec(targetDist) {
  var params = _.map(targetDist.meta.params, function(paramMeta) {
    var name = paramMeta.name;
    var targetParam = ad.value(targetDist.params[name]);
    return [name, paramSpec(paramMeta.type, targetParam)];
  });

  return {
    type: targetDist.constructor,
    params: _.fromPairs(params)
  };
}

// Describes the default approach to guiding a distribution parameter
// of a given type. The current value of the corresponding parameter
// in the target distribution is used to determine the dimension of
// tensor valued distribution parameters at run time.

function paramSpec(type, targetParam) {
  switch (type.name) {
    case 'real':
      return {param: {dims: [1], squish: squishToInterval(type.bounds)}};
    case 'vector':
    case 'vectorOrRealArray':
      // Both vectors and arrays have a length property.
      return {param: {dims: [targetParam.length, 1], squish: squishToInterval(type.bounds)}};
    case 'tensor':
      return {param: {dims: targetParam.dims, squish: squishToInterval(type.bounds)}};
    case 'int':
      return {const: targetParam};
    case 'array':
      if (type.elementType.name === 'any' || type.elementType.name === 'int') {
        return {const: targetParam};
      } else {
        throw paramSpecError(type);
      }
    default:
      throw paramSpecError(type);
  }
}

function paramSpecError(type) {
  var msg = 'Can\'t generate specification for parameter of type "' + type.name + '".';
  return new Error(msg);
}

function dirichletSpec(targetDist) {
  var d = ad.value(targetDist.params.alpha).length - 1;
  return {
    type: dists.LogisticNormal,
    params: {
      mu: {param: {dims: [d, 1]}},
      sigma: {param: {dims: [d, 1], squish: squishTo(0, Infinity)}}
    }
  };
}

function tensorGaussianSpec(targetDist) {
  var dims = targetDist.params.dims;
  return {
    type: dists.DiagCovGaussian,
    params: {
      mu: {param: {dims: dims}},
      sigma: {param: {dims: dims, squish: squishTo(0, Infinity)}}
    }
  };
}

function uniformSpec(targetDist) {
  return {
    type: dists.LogitNormal,
    params: {
      a: {const: targetDist.params.a},
      b: {const: targetDist.params.b},
      mu: {param: {dims: [1]}},
      sigma: {param: {dims: [1], squish: squishTo(0, Infinity)}}
    }
  };
}

function betaSpec(targetDist) {
  return {
    type: dists.LogitNormal,
    params: {
      a: {const: 0},
      b: {const: 1},
      mu: {param: {dims: [1]}},
      sigma: {param: {dims: [1], squish: squishTo(0, Infinity)}}
    }
  };
}

function gammaSpec(targetDist) {
  return {
    type: dists.IspNormal,
    params: {
      mu: {param: {dims: [1]}},
      sigma: {param: {dims: [1], squish: squishTo(0, Infinity)}}
    }
  };
}

function discreteSpec(dim) {
  return {
    type: dists.Discrete,
    params: {
      ps: {param: {dims: [dim - 1, 1], squish: numeric.squishToProbSimplex}}
    }
  };
}

function softplus(x) {
  return T.log(T.add(T.exp(x), 1));
}

function squishTo(a, b) {
  if (a === -Infinity && b === Infinity) {
    throw new Error('Squishing not required here.');
  }
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

function squishToInterval(interval) {
  return interval && interval.isBounded ?
      squishTo(interval.low, interval.high) :
      null;
}

module.exports = {
  independent: independent,
  runThunk: runThunk,
  getDist: getDist
};
