'use strict';

var assert = require('assert');
var _ = require('underscore');
var util = require('./util');
var Tensor = require('./tensor');
var ad = require('./ad');
var dists = require('./dists');
var domains = require('./domain');

var T = ad.tensor;

// We could consider allowing distributions to be passed directly as
// guides in the special case where there are no parameters involved.
// e.g. Simple importance sampling examples. Are these important
// enough to make this worthwhile.

// FIXME: Doing 'return false' (or using just explicit return to
// achieve the same) from the guide breaks readable error messages. It
// appears that the top webppl entry on the stack is the call to the
// continuation corresponding to the return, and that the location of
// that is not in the source map. I think I need to clear the stack
// (which I now do) and then modify the error handling to work when
// the top most webppl frame on the JS stack is `runTrampoline`.


// TODO: This is do the same thing we have to do when running drift
// kernels, so combine. (Only difference is names used in error
// messages.)

function notAllowed(fn) {
  return function() {
    throw new Error(fn + ' is not allowed here.');
  };
}

var sampleNotAllowed = notAllowed('sample');
var factorNotAllowed = notAllowed('factor');

function guideCoroutine(env) {
  return {
    sample: sampleNotAllowed,
    factor: factorNotAllowed,
    incrementalize: env.defaultCoroutine.incrementalize,
    // Copy the entry address from the current coroutine so that
    // parameter names continue to be relative to it.
    a: env.coroutine.a,
    // Use params/paramsSeen of the current coroutine so that params
    // are fetch/tracked correctly.
    params: env.coroutine.params,
    paramsSeen: env.coroutine.paramsSeen,
    // A flag used when creating parameters to check whether we're in
    // a guide thunk. Note that this does the right thing if Infer is
    // used within a guide. This can be checked from a webppl program
    // using the `inGuide()` helper.
    _guide: true
  };
}

function inCoroutine(coroutine, env, k, f) {
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
  return inCoroutine(
      guideCoroutine(env),
      env, k,
      function(k) {
        return thunk(s, function(s2, dist) {
          return function() {
            if (!dists.isDist(dist)) {
              throw new Error('The guide did not return a distribution.');
            }
            return k(s2, dist);
          };
        }, a + '_guide');
      });
}

function runIfThunk(s, k, a, env, maybeThunk, alternate) {
  return maybeThunk ?
      runThunk(maybeThunk, env, s, a, k) :
      alternate(s, k, a);
}

// Convenient variations on runGuideThunk.

function runThunkOrNull(maybeThunk, env, s, a, k) {
  return runIfThunk(s, k, a, env, maybeThunk, function(s, k, a) {
    return k(s, null);
  });
}

function runThunkOrAuto(maybeThunk, targetDist, env, s, a, k) {
  return runIfThunk(s, k, a, env, maybeThunk, function(s, k, a) {
    return k(s, independent(targetDist, a, env));
  });
}

// Returns an independent guide distribution for the given target
// distribution, sample address pair. Guiding all choices with
// independent guide distributions and optimizing the elbo yields
// mean-field variational inference.

var mfWarningIssued = false;

function independent(targetDist, sampleAddress, env) {

  if (!mfWarningIssued) {
    mfWarningIssued = true;
    util.warn('Defaulting to mean-field for one or more choices.');
  }

  // Include the distribution name in the guide parameter name to
  // avoid collisions when the distribution type changes between
  // calls. (As a result of the distribution passed depending on a
  // random choice.)
  var relativeAddress = util.relativizeAddress(env, sampleAddress);
  var baseName = relativeAddress + '$mf$' + targetDist.meta.name + '$';

  var distSpec = spec(targetDist);

  var guideParams = _.mapObject(distSpec.params, function(spec, name) {

    return _.has(spec, 'param') ?
        makeParam(spec.param, name, baseName, env) :
        spec.const;

  });

  return new distSpec.type(guideParams);

}

function makeParam(paramSpec, paramName, baseName, env) {
  var dims = paramSpec.dims; // e.g. [2, 1]
  var domain = paramSpec.domain; // e.g. new RealInterval(0, Infinity)
  var name = baseName + paramName;

  var viParamDim, squish;
  if (domain) {
    var ret = squishFn(domain, dims);
    viParamDim = ret.dimsIn;
    squish = ret.f;
  } else {
    viParamDim = dims;
  }

  var param = registerParam(env, name, viParamDim);

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
//   type: TensorGaussian,
//   params: {
//     mu: {param: {dims: [1]}},
//     sigma: {param: {dims: [1]}},
//     dims: {const: [0, 1]}
//   }
// }

// Note that all parameters described are tensors. If a distribution
// is parameterized by a scalar then the spec includes a tensor with
// dims=[1] for that parameter. It is the responsibility of callers to
// turn this back into a scalar before use.

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
    return discreteSpec(targetDist);
  } else if (targetDist instanceof dists.RandomInteger ||
             targetDist instanceof dists.Binomial ||
             targetDist instanceof dists.MultivariateGaussian) {
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
  var paramSpec = _.map(targetDist.meta.params, function(paramMeta) {

    var name = paramMeta.name;
    var targetParam = ad.value(targetDist.params[name]);

    var dims;
    if (targetParam instanceof Tensor) {
      dims = targetParam.dims;
    } else if (_.isNumber(targetParam)) {
      dims = [1];
    } else {
      throwAutoGuideError(targetDist);
    }

    return [name, {param: {dims: dims, domain: paramMeta.domain}}];

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
      mu: {param: {dims: [d, 1]}},
      sigma: {param: {dims: [d, 1], domain: domains.gt(0)}}
    }
  };
}

function tensorGaussianSpec(targetDist) {
  var dims = targetDist.params.dims;
  return {
    type: dists.DiagCovGaussian,
    params: {
      mu: {param: {dims: dims}},
      sigma: {param: {dims: dims, domain: domains.gt(0)}}
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
      sigma: {param: {dims: [1], domain: domains.gt(0)}}
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
      sigma: {param: {dims: [1], domain: domains.gt(0)}}
    }
  };
}

function gammaSpec(targetDist) {
  return {
    type: dists.IspNormal,
    params: {
      mu: {param: {dims: [1]}},
      sigma: {param: {dims: [1], domain: domains.gt(0)}}
    }
  };
}

function discreteSpec(targetDist) {
  var d = ad.value(targetDist.params.ps).length;
  return {
    type: dists.Discrete,
    params: {
      ps: {param: {dims: [d, 1], domain: domains.simplex}}
    }
  };
}

function softplus(x) {
  return T.log(T.add(T.exp(x), 1));
}

// Returns a function `f` that maps from tensors of unbounded reals to
// tensors in `domain` of dimension `dimsOut`. The function `f` takes
// a tensor of unbounded reals of dimension `dimsIn`.

// Parameters:
// domain: Output domain
// dimsOut: Output dimension

// Returns:
// dimsIn: Input dimension
// f: Squishing function

function squishFn(domain, dimsOut) {
  if (domain instanceof domains.RealInterval) {
    return {dimsIn: dimsOut, f: squishToInterval(domain)};
  } else if (domain === domains.simplex) {
    if (dimsOut.length !== 2 || dimsOut[1] !== 1) {
      throw new Error('Can only map vectors to the probability simplex.');
    }
    return {dimsIn: [dimsOut[0] - 1, 1], f: dists.squishToProbSimplex};
  } else {
    throw new Error('Unknown domain type.');
  }
}

function squishToInterval(domain) {
  var a = domain.a;
  var b = domain.b;
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
  independent: independent,
  runThunkOrAuto: runThunkOrAuto,
  runThunkOrNull: runThunkOrNull
};
