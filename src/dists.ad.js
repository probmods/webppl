////////////////////////////////////////////////////////////////////
// Distributions
//
// Distributions can have sampling, scoring, and support functions. A
// single distribution need not have all three, but some inference
// functions will complain if they're missing one.
//
// The main thing we can do with distributions in WebPPL is feed them
// into the "sample" primitive to get a sample.
//
// required:
// - dist.sample() returns a value sampled from the distribution.
// - dist.score(val) returns the log-probability of val under the
//   distribution.
//
// Note that `sample` methods are responsible for un-lifting params as
// necessary.
//
// optional:
// - dist.support() gives either an array of support elements (for
//   discrete distributions with finite support) or an object with
//   'lower' and 'upper' properties (for continuous distributions with
//   bounded support).
//
// All distributions should also satisfy the following:
//
// - All distributions of a particular type should share the same set
//   of parameters.

'use strict';

var Tensor = require('./tensor');
var _ = require('underscore');
var util = require('./util');
var assert = require('assert');
var inspect = require('util').inspect;
var types = require('./types');

var LOG_PI = 1.1447298858494002;
var LOG_2PI = 1.8378770664093453;

// This acts as a base class for all distributions.

function Distribution() {}

Distribution.prototype = {

  toJSON: function() {
    throw new Error('Not implemented');
  },

  inspect: function(depth, options) {
    if (_.has(this, 'params')) {
      if (this.print) {
        return this.print();
      } else {
        return [this.meta.name, '(', inspect(this.params), ')'].join('');
      }
    } else {
      // This isn't an instance of a distribution type.
      // e.g. Uniform.prototype.inspect()
      // Reinspect while ignoring this custom inspection method.
      var opts = options ? _.clone(options) : {};
      opts.customInspect = false;
      return inspect(this, opts);
    }
  },

  toString: function() {
    return this.inspect();
  },

  isContinuous: false,
  constructor: Distribution

};

function isDist(x) {
  return x instanceof Distribution;
}

function clone(dist) {
  return new dist.constructor(dist.params);
}

var serialize = function(dist) {
  return util.serialize(dist);
};

var deserialize = function(JSONString) {
  var obj = util.deserialize(JSONString);
  if (!obj.probs || !obj.support) {
    throw new Error('Cannot deserialize a non-distribution JSON object: ' + JSONString);
  }
  return new Categorical({ps: obj.probs, vs: obj.support});
};

// Mixins.

// The motivation for using mixins is that there isn't an obviously
// correct (single inheritance) hierarchy. For example, the categories
// uni/multi-variate and discrete/continuous are cross-cutting.

var finiteSupport = {

  MAP: function() {
    var map = { score: -Infinity };
    this.support().forEach(function(val) {
      var score = this.score(val);
      if (score > map.score) {
        map = { val: val, score: score };
      }
    }, this);
    return map;
  },

  entropy: function() {
    return _.reduce(this.support(), function(memo, x) {
      var score = this.score(x);
      return memo - (score === -Infinity ? 0 : Math.exp(score) * score);
    }, 0, this);
  },

  toJSON: function() {
    var support = this.support();
    var probs = support.map(function(s) { return Math.exp(this.score(s)); }, this);
    return { probs: probs, support: support };
  }

};

var continuousSupport = {
  isContinuous: true
};

// Flag to indicate that HMC is not supported by a distribution.
var noHMC = {
  noHMC: true
};

var methodNames = ['sample', 'score', 'support', 'print', 'base', 'transform'];

function makeDistributionType(options) {
  options = util.mergeDefaults(options, {
    mixins: []
  });

  ['name', 'params'].forEach(function(name) {
    if (!_.has(options, name)) {
      console.log(options);
      throw new Error('makeDistributionType: ' + name + ' is required.');
    }
  });

  // Wrap the score function with args check.
  if (options.score) {
    var originalScoreFn = options.score;
    options.score = function(val) {
      if (arguments.length !== 1) {
        throw new Error('The score method of ' + this.meta.name +
                        ' expected 1 argument but received ' +
                        arguments.length + '.');
      }
      return originalScoreFn.call(this, val);
    };
  }

  var parameterNames = _.pluck(options.params, 'name');
  var parameterTypes = _.map(options.params, function(param) {
    if (_.has(param, 'type') && !(param.type && param.type.check)) {
      throw new Error('Invalid type given for parameter ' + param.name + ' of ' + options.name + '.');
    }
    return param.type;
  });
  var extraConstructorFn = options.constructor;

  // Note that Chrome uses the name of this local variable in the
  // output of `console.log` when it's called on a distribution that
  // uses the default constructor.
  var dist = function(params) {

    if (params === undefined && parameterNames.length > 0) {
      throw new Error('Parameters not supplied to ' + this.meta.name + ' distribution.');
    }
    parameterNames.forEach(function(p, i) {
      if (!params.hasOwnProperty(p)) {
        throw new Error('Parameter \"' + p + '\" missing from ' + this.meta.name + ' distribution.');
      }

      // TODO: Dealing with ad nodes is kinda tiresome. Maybe we have
      // a way of caching the unlifting to save redo-ing work. e.g.
      // when sampling, inspecting parameters to generate guides, etc.
      // We could use the type information to know how to unlift
      // without having to resort to the generic `valueRec`?
      var type = parameterTypes[i];
      if (type && !type.check(ad.valueRec(params[p]))) {
        throw new Error('Parameter \"' + p + '\" should be of type "' + type.desc + '".');
      }

    }, this);
    this.params = params;
    if (extraConstructorFn !== undefined) {
      extraConstructorFn.call(this);
    }
  };

  dist.prototype = Object.create(Distribution.prototype);
  dist.prototype.constructor = dist;

  dist.prototype.meta = _.pick(options, 'name', 'desc', 'params', 'nodoc', 'nohelper', 'wikipedia');

  _.extendOwn.apply(_, [dist.prototype].concat(options.mixins));
  _.extendOwn(dist.prototype, _.pick(options, methodNames));

  ['sample', 'score'].forEach(function(method) {
    if (!dist.prototype[method]) {
      throw new Error('makeDistributionType: method "' + method + '" not defined for ' + options.name);
    }
  });

  return dist;
}

// Distributions

var ImproperUniform = makeDistributionType({
  name: 'ImproperUniform',
  desc: 'Improper continuous uniform distribution which has probability one everywhere.',
  params: [],
  nodoc: true,
  nohelper: true,
  mixins: [continuousSupport],
  sample: function() {
    throw new Error('cannot sample from this improper distribution.')
  },
  score: function(val) {
    return 0;
  }
});

var Uniform = makeDistributionType({
  name: 'Uniform',
  desc: 'Continuous uniform distribution over ``[a, b]``',
  params: [{name: 'a', desc: 'lower bound', type: types.unboundedReal},
           {name: 'b', desc: 'upper bound (>a)', type: types.unboundedReal}],
  wikipedia: 'Uniform_distribution_(continuous)',
  mixins: [continuousSupport],
  sample: function() {
    var u = util.random();
    return (1 - u) * ad.value(this.params.a) + u * ad.value(this.params.b);
  },
  score: function(val) {
    'use ad';
    if (val < this.params.a || val > this.params.b) {
      return -Infinity;
    }
    return -Math.log(this.params.b - this.params.a);
  },
  support: function() {
    return { lower: this.params.a, upper: this.params.b };
  }
});

var Bernoulli = makeDistributionType({
  name: 'Bernoulli',
  desc: 'Distribution over ``{true, false}``',
  params: [{name: 'p', desc: 'success probability', type: types.unitInterval}],
  wikipedia: true,
  mixins: [finiteSupport],
  sample: function() {
    return util.random() < ad.value(this.params.p);
  },
  score: function(val) {
    'use ad';
    if (val !== true && val !== false) {
      return -Infinity;
    }
    return val ? Math.log(this.params.p) : Math.log(1 - this.params.p);
  },
  support: function() {
    return [true, false];
  }
});

function mvBernoulliScore(ps, x) {
  assert.ok(ad.value(x).rank === 2);
  assert.ok(ad.value(x).dims[1] === 1);
  assert.ok(ad.value(x).dims[0] === ad.value(ps).dims[0]);

  var xSub1 = ad.tensor.sub(x, 1);
  var pSub1 = ad.tensor.sub(ps, 1);

  return ad.tensor.sumreduce(
    ad.tensor.log(
      ad.tensor.add(
        ad.tensor.mul(x, ps),
        ad.tensor.mul(xSub1, pSub1))));
}


var MultivariateBernoulli = makeDistributionType({
  name: 'MultivariateBernoulli',
  desc: 'Distribution over a vector of independent Bernoulli variables. Each element ' +
    'of the vector takes on a value in ``{0, 1}``. Note that this differs from ``Bernoulli`` which ' +
    'has support ``{true, false}``.',
  params: [{name: 'ps', desc: 'probabilities', type: types.unitIntervalVector}],
  mixins: [finiteSupport],
  sample: function() {
    var ps = ad.value(this.params.ps);
    var d = ps.dims[0];
    var x = new Tensor([d, 1]);
    var n = x.length;
    while (n--) {
      x.data[n] = util.random() < ps.data[n];
    }
    return x;
  },
  score: function(x) {
    return mvBernoulliScore(this.params.ps, x);
  },
  support: function() {
    var dims = this.params.ps.dims;
    var d = dims[0];
    var n = Math.pow(2, d);
    return _.times(n, function(x) {
      return new Tensor(dims).fromFlatArray(toBinaryArray(x, d));
    });
  }
});

function toBinaryArray(x, length) {
  assert.ok(x >= 0 && x < Math.pow(2, length));
  var arr = [];
  for (var i = 0; i < length; i++) {
    arr.push(x % 2);
    x = x >> 1;
  }
  return arr;
}

var RandomInteger = makeDistributionType({
  name: 'RandomInteger',
  desc: 'Uniform distribution over ``{0,1,...,n-1}``',
  params: [{name: 'n', desc: 'number of possible values', type: types.positiveInt}],
  wikipedia: 'Uniform_distribution_(discrete)',
  mixins: [finiteSupport],
  sample: function() {
    return Math.floor(util.random() * this.params.n);
  },
  score: function(val) {
    'use ad';
    var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < this.params.n);
    return inSupport ? -Math.log(this.params.n) : -Infinity;
  },
  support: function() {
    return _.range(this.params.n);
  }
});

// Leva 1992: A Fast Normal Random Number Generator
function gaussianSample(mu, sigma) {
  var u, v, x, y, q;
  do {
    u = 1 - util.random();
    v = 1.7156 * (util.random() - 0.5);
    x = u - 0.449871;
    y = Math.abs(v) + 0.386595;
    q = x * x + y * (0.196 * y - 0.25472 * x);
  } while (q >= 0.27597 && (q > 0.27846 || v * v > -4 * u * u * Math.log(u)));
  return mu + sigma * v / u;
}

function gaussianScore(mu, sigma, x) {
  'use ad';
  return -0.5 * (LOG_2PI + 2 * Math.log(sigma) + (x - mu) * (x - mu) / (sigma * sigma));
}



var Gaussian = makeDistributionType({
  name: 'Gaussian',
  desc: 'Distribution over reals.',
  params: [{name: 'mu', desc: 'mean', type: types.unboundedReal},
           {name: 'sigma', desc: 'standard deviation', type: types.positiveReal}],
  wikipedia: 'Normal_distribution',
  mixins: [continuousSupport],
  sample: function() {
    return gaussianSample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return gaussianScore(this.params.mu, this.params.sigma, x);
  },
  base: function() {
    return new Gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    // Transform a sample x from the base distribution to the
    // distribution described by params.
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.scalar.add(ad.scalar.mul(sigma, x), mu);  }
});


function mvGaussianSample(mu, cov) {
  var d = mu.dims[0];
  var z = new Tensor([d, 1]);
  for (var i = 0; i < d; i++) {
    z.data[i] = gaussianSample(0, 1);
  }
  var L = cov.cholesky();
  return L.dot(z).add(mu);
}

function mvGaussianScore(mu, cov, x) {
  var _x = ad.value(x);
  var _mu = ad.value(mu);
  var _cov = ad.value(cov);
  if (!util.isVector(_x) || !util.tensorEqDim0(_x, _mu)) {
    return -Infinity;
  }

  var d = _mu.dims[0];
  var dLog2Pi = d * LOG_2PI;
  var logDetCov = ad.scalar.log(ad.tensor.determinant(cov));
  var z = ad.tensor.sub(x, mu);
  var zT = ad.tensor.transpose(z);
  var prec = ad.tensor.inverse(cov);
  return ad.scalar.mul(-0.5, ad.scalar.add(
    dLog2Pi, ad.scalar.add(
      logDetCov,
      ad.tensor.get(ad.tensor.dot(ad.tensor.dot(zT, prec), z), 0))));
}


var MultivariateGaussian = makeDistributionType({
  name: 'MultivariateGaussian',
  desc: 'Multivariate Gaussian distribution with full covariance matrix. ' +
    'If ``mu`` has length d and ``cov`` is a ``d``-by-``d`` matrix, ' +
    'then the distribution is over vectors of length ``d``.',
  params: [{name: 'mu', desc: 'mean', type: types.unboundedVector},
           {name: 'cov', desc: 'covariance', type: types.posDefMatrix}],
  wikipedia: 'Multivariate_normal_distribution',
  mixins: [continuousSupport],
  constructor: function() {
    var _mu = ad.value(this.params.mu);
    var _cov = ad.value(this.params.cov);
    if (!util.tensorEqDim0(_mu, _cov)) {
      throw new Error(this.meta.name + ': dimension mismatch between mu and cov.');
    }
  },
  sample: function() {
    return mvGaussianSample(ad.value(this.params.mu), ad.value(this.params.cov));
  },
  score: function(val) {
    return mvGaussianScore(this.params.mu, this.params.cov, val);
  }
});


function diagCovGaussianSample(mu, sigma) {
  var dims = mu.dims;
  var x = new Tensor(dims);
  var n = x.length;
  while (n--) {
    x.data[n] = gaussianSample(mu.data[n], sigma.data[n]);
  }
  return x;
}

function diagCovGaussianScore(mu, sigma, x) {
  var _x = ad.value(x);
  var _mu = ad.value(mu);
  if (!util.isTensor(_x) || !util.tensorEqDims(_x, _mu)) {
    return -Infinity;
  }

  var d = _mu.length;
  var dLog2Pi = d * LOG_2PI;
  var logDetCov = ad.scalar.mul(2, ad.tensor.sumreduce(ad.tensor.log(sigma)));
  var z = ad.tensor.div(ad.tensor.sub(x, mu), sigma);

  return ad.scalar.mul(-0.5, ad.scalar.add(
    dLog2Pi, ad.scalar.add(
      logDetCov,
      ad.tensor.sumreduce(ad.tensor.mul(z, z)))));
}


var DiagCovGaussian = makeDistributionType({
  name: 'DiagCovGaussian',
  desc: 'A distribution over tensors in which each element is independent and Gaussian distributed, ' +
    'with its own mean and standard deviation. i.e. A multivariate Gaussian distribution with ' +
    'diagonal covariance matrix. The distribution is over tensors that have the same shape as the ' +
    'parameters ``mu`` and ``sigma``, which in turn must have the same shape as each other.',
  params: [
    {name: 'mu', desc: 'mean', type: types.unboundedTensor},
    {name: 'sigma', desc: 'standard deviations', type: types.positiveTensor}
  ],
  mixins: [continuousSupport],
  constructor: function() {
    var _mu = ad.value(this.params.mu);
    var _sigma = ad.value(this.params.sigma);
    if (!util.tensorEqDims(_mu, _sigma)) {
      throw new Error(this.meta.name + ': mu and sigma should be the same shape.');
    }
  },
  sample: function() {
    return diagCovGaussianSample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return diagCovGaussianScore(this.params.mu, this.params.sigma, x);
  },
  base: function() {
    var dims = ad.value(this.params.mu).dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.tensor.add(ad.tensor.mul(sigma, x), mu);
  }
});

var squishToProbSimplex = function(x) {
  // Map a d dimensional vector onto the d simplex.
  var d = ad.value(x).dims[0];
  var u = ad.tensor.reshape(ad.tensor.concat(x, ad.tensor.fromScalars(0)), [d + 1, 1]);
  return ad.tensor.softmax(u);
};

// Atchison, J., and Sheng M. Shen. "Logistic-normal distributions:
// Some properties and uses." Biometrika 67.2 (1980): 261-272.

var LogisticNormal = makeDistributionType({
  name: 'LogisticNormal',
  desc: 'A distribution over probability vectors obtained by transforming a random variable ' +
    'drawn from ``DiagCovGaussian({mu: mu, sigma: sigma})``. If ``mu`` and ``sigma`` have length ``d`` ' +
    'then the distribution is over probability vectors of length ``d+1``.',
  params: [
    {name: 'mu', desc: 'mean', type: types.unboundedVector},
    {name: 'sigma', desc: 'standard deviations', type: types.positiveVector}
  ],
  wikipedia: 'Logit-normal_distribution#Multivariate_generalization',
  mixins: [continuousSupport, noHMC],
  constructor: function() {
    var _mu = ad.value(this.params.mu);
    var _sigma = ad.value(this.params.sigma);
    if (!util.tensorEqDim0(_mu, _sigma)) {
      throw new Error(this.meta.name + ': mu and sigma should have the same length.');
    }
  },
  sample: function() {
    return squishToProbSimplex(diagCovGaussianSample(ad.value(this.params.mu), ad.value(this.params.sigma)));
  },
  score: function(val) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    var _mu = ad.value(mu);
    var _val = ad.value(val);



    if (!util.isVector(_val) || _val.dims[0] - 1 !== _mu.dims[0]) {
      return -Infinity;
    }

    var d = _mu.dims[0];
    var u = ad.tensor.reshape(ad.tensor.range(val, 0, d), [d, 1]);
    var u_last = ad.tensor.get(val, d);
    var inv = ad.tensor.log(ad.tensor.div(u, u_last));
    var normScore = diagCovGaussianScore(mu, sigma, inv);
    return ad.scalar.sub(normScore, ad.tensor.sumreduce(ad.tensor.log(val)));
  },
  base: function() {
    var dims = ad.value(this.params.mu).dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return squishToProbSimplex(ad.tensor.add(ad.tensor.mul(sigma, x), mu));
  }
});


var LogitNormal = makeDistributionType({
  name: 'LogitNormal',
  desc: 'A distribution over ``(a,b)`` obtained by scaling and shifting a standard logit-normal.',
  params: [
    {name: 'mu', desc: 'location', type: types.unboundedReal},
    {name: 'sigma', desc: 'scale', type: types.positiveReal},
    {name: 'a', desc: 'lower bound', type: types.unboundedReal},
    {name: 'b', desc: 'upper bound (>a)', type: types.unboundedReal}
  ],
  wikipedia: 'Logit-normal_distribution',
  mixins: [continuousSupport],
  sample: function() {
    var a = ad.value(this.params.a);
    var b = ad.value(this.params.b);
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    var x = gaussianSample(mu, sigma);
    return (ad.scalar.sigmoid(x) * (b - a)) + a;
  },
  score: function(val) {
    'use ad';
    var a = this.params.a;
    var b = this.params.b;
    var y = (val - a) / (b - a);
    var x = Math.log(y / (1 - y));
    var gaussScore = gaussianScore(this.params.mu, this.params.sigma, x);
    return gaussScore - Math.log(y * (1 - y) * (b - a));
  },
  base: function() {
    return new Gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    'use ad';
    var a = this.params.a;
    var b = this.params.b;
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return (ad.scalar.sigmoid((x * sigma) + mu) * (b - a)) + a;
  },
  support: function() {
    return {lower: this.params.a, upper: this.params.b};
  }
});



var IspNormal = makeDistributionType({
  name: 'IspNormal', // For 'Inverse softplus normal'.
  nodoc: true,
  desc: 'A distribution over positive reals obtained by mapping a Gaussian ' +
      'distributed variable through the softplus function.',
  params: [
    {name: 'mu', desc: 'location', type: types.unboundedReal},
    {name: 'sigma', desc: 'scale', type: types.positiveReal}
  ],
  mixins: [continuousSupport],
  sample: function() {
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    return Math.log(Math.exp(gaussianSample(mu, sigma)) + 1);
  },
  score: function(val) {
    'use ad';
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    var x = Math.log(Math.exp(val) - 1);
    return gaussianScore(mu, sigma, x) + val - x;
  },
  base: function() {
    return new Gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    'use ad';
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return Math.log(Math.exp((x * sigma) + mu) + 1);
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});



function tensorGaussianSample(mu, sigma, dims) {
  var x = new Tensor(dims);
  var n = x.length;
  while (n--) {
    x.data[n] = gaussianSample(mu, sigma);
  }
  return x;
}

function tensorGaussianScore(mu, sigma, dims, x) {
  var _x = ad.value(x);
  if (!util.isTensor(_x) || !_.isEqual(_x.dims, dims)) {
    return -Infinity;
  }

  var d = _x.length;
  var dLog2Pi = d * LOG_2PI;
  var _2dLogSigma = ad.scalar.mul(2 * d, ad.scalar.log(sigma));
  var sigma2 = ad.scalar.pow(sigma, 2);
  var xSubMu = ad.tensor.sub(x, mu);
  var z = ad.scalar.div(ad.tensor.sumreduce(ad.tensor.mul(xSubMu, xSubMu)), sigma2);

  return ad.scalar.mul(-0.5, ad.scalar.sum(dLog2Pi, _2dLogSigma, z));
}

var TensorGaussian = makeDistributionType({
  name: 'TensorGaussian',
  desc: 'Distribution over a tensor of independent Gaussian variables.',
  params: [
    {name: 'mu', desc: 'mean', type: types.unboundedReal},
    {name: 'sigma', desc: 'standard deviation', type: types.positiveReal},
    {name: 'dims', desc: 'dimension of tensor', type: types.array(types.positiveInt)}
  ],
  mixins: [continuousSupport],
  sample: function() {
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    var dims = this.params.dims;
    return tensorGaussianSample(mu, sigma, dims);
  },
  score: function(x) {
    return tensorGaussianScore(this.params.mu, this.params.sigma, this.params.dims, x);
  },
  base: function() {
    var dims = this.params.dims;
    return new TensorGaussian({mu: 0, sigma: 1, dims: dims});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.tensor.add(ad.tensor.mul(x, sigma), mu);
  }
});



var Cauchy = makeDistributionType({
  name: 'Cauchy',
  desc: 'Distribution over ``[-Infinity, Infinity]``',
  params: [{name: 'location', desc: '', type: types.unboundedReal},
           {name: 'scale', desc: '', type: types.positiveReal}],
  wikipedia: true,
  mixins: [continuousSupport],
  sample: function() {
    var u = util.random();
    return ad.value(this.params.location) + ad.value(this.params.scale) * Math.tan(Math.PI * (u - 0.5));
  },
  score: function(x) {
    'use ad';
    var scale = this.params.scale;
    var location = this.params.location;
    return -LOG_PI - Math.log(scale) - Math.log(1 + Math.pow((x - location) / scale, 2));
  },
  base: function () {
    return new Uniform({a: 0, b: 1});
  },
  transform: function (x) {
    'use ad';
    var location = this.params.location;
    var scale = this.params.scale;
    return location + scale * Math.tan(Math.PI * (x - 0.5));
  }
});


function sum(xs) {
  'use ad';
  return xs.reduce(function(a, b) { return a + b; }, 0);
}


function discreteScore(ps, i) {
  var scoreFn = _.isArray(ps) ? discreteScoreArray : discreteScoreVector;
  return scoreFn(ps, i);
}

function inDiscreteSupport(val, dim) {
  return (val === Math.floor(val)) && (0 <= val) && (val < dim);
};

function discreteScoreVector(probs, val) {
  'use ad';
  var _probs = ad.value(probs);
  var d = _probs.dims[0];
  return inDiscreteSupport(val, d) ?
      Math.log(T.get(probs, val) / T.sumreduce(probs)) :
      -Infinity;
}

function discreteScoreArray(probs, val) {
  'use ad';
  var d = probs.length;
  return inDiscreteSupport(val, d) ? Math.log(probs[val] / sum(probs)) : -Infinity;
}

// Extracts an array of values from a (possibly lifted) tensor or an
// array (whose contents maybe lifted).
function toUnliftedArray(x) {
  return _.isArray(x) ? x.map(ad.value) : ad.value(x).data;
}

var Discrete = makeDistributionType({
  name: 'Discrete',
  desc: 'Distribution over ``{0,1,...,ps.length-1}`` with P(i) proportional to ``ps[i]``',
  params: [
    {name: 'ps', desc: 'probabilities (can be unnormalized)', type: types.nonNegativeVectorOrRealArray}
  ],
  wikipedia: 'Categorical_distribution',
  mixins: [finiteSupport],
  sample: function() {
    return discreteSample(toUnliftedArray(this.params.ps));
  },
  score: function(val) {
    return discreteScore(this.params.ps, val);
  },
  support: function() {
    // This does the right thing for arrays and vectors.
    return _.range(ad.value(this.params.ps).length);
  }
});


// an implementation of Marsaglia & Tang, 2000:
// A Simple Method for Generating Gamma Variables
function gammaSample(shape, scale) {
  if (shape < 1) {
    var r;
    r = gammaSample(1 + shape, scale) * Math.pow(util.random(), 1 / shape);
    if (r === 0) {
      util.warn('gamma sample underflow, rounded to nearest representable support value');
      return Number.MIN_VALUE;
    }
    return r;
  }
  var x, v, u;
  var d = shape - 1 / 3;
  var c = 1 / Math.sqrt(9 * d);
  while (true) {
    do {
      x = gaussianSample(0, 1);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    u = util.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return scale * d * v;
    }
  }
}

function expGammaSample(shape, scale) {
  if (shape < 1) {
    var r;
    r = expGammaSample(1 + shape, scale) + Math.log(util.random()) / shape;
    if (r === -Infinity) {
      util.warn('log gamma sample underflow, rounded to nearest representable support value');
      return -Number.MAX_VALUE;
    }
    return r;
  }
  var x, v, u, log_v;
  var d = shape - 1 / 3;
  var c = 1 / Math.sqrt(9 * d);
  while (true) {
    do {
      x = gaussianSample(0, 1);
      v = 1 + c * x;
    } while (v <= 0);

    log_v = 3 * Math.log(v);
    v = v * v * v;
    u = util.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return Math.log(scale) + Math.log(d) + log_v;
    }
  }
}

function expGammaScore(shape, scale, val) {
  'use ad';
  var x = val;
  return (shape - 1) * x - Math.exp(x) / scale - ad.scalar.logGamma(shape) - shape * Math.log(scale);
}


var Gamma = makeDistributionType({
  name: 'Gamma',
  desc: 'Distribution over positive reals.',
  params: [{name: 'shape', desc: '', type: types.positiveReal},
           {name: 'scale', desc: '', type: types.positiveReal}],
  wikipedia: true,
  mixins: [continuousSupport],
  sample: function() {
    return gammaSample(ad.value(this.params.shape), ad.value(this.params.scale));
  },
  score: function(x) {
    'use ad';
    var shape = this.params.shape;
    var scale = this.params.scale;
    return (shape - 1) * Math.log(x) - x / scale - ad.scalar.logGamma(shape) - shape * Math.log(scale);
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});


var Exponential = makeDistributionType({
  name: 'Exponential',
  desc: 'Distribution over ``[0, Infinity]``',
  params: [{name: 'a', desc: 'rate', type: types.positiveReal}],
  wikipedia: true,
  mixins: [continuousSupport],
  sample: function() {
    var u = util.random();
    return Math.log(u) / (-1 * ad.value(this.params.a));
  },
  score: function(val) {
    'use ad';
    return Math.log(this.params.a) - this.params.a * val;
  },
  base: function () {
    return new Uniform({a: 0, b: 1});
  },
  transform: function (x) {
    'use ad';
    return Math.log(x) / -this.params.a;
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});


function logBeta(a, b) {
  'use ad';
  return ad.scalar.logGamma(a) + ad.scalar.logGamma(b) - ad.scalar.logGamma(a + b);
}




var Beta = makeDistributionType({
  name: 'Beta',
  desc: 'Distribution over ``[0, 1]``',
  params: [{name: 'a', desc: 'shape', type: types.positiveReal},
           {name: 'b', desc: 'shape', type: types.positiveReal}],
  wikipedia: true,
  mixins: [continuousSupport],
  sample: function() {
    return betaSample(ad.value(this.params.a), ad.value(this.params.b));
  },
  score: function(x) {
    'use ad';
    var a = this.params.a;
    var b = this.params.b;

    return ((x > 0 && x < 1) ?
            (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b) :
            -Infinity);
  },
  support: function() {
    return { lower: 0, upper: 1 };
  }
});

function betaSample(a, b) {
  var log_x = expGammaSample(a, 1);
  var log_y = expGammaSample(b, 1);
  var v = 1 / (1 + Math.exp(log_y - log_x));
  if (v === 0) {
    util.warn('beta sample underflow, rounded to nearest representable support value');
    v = Number.MIN_VALUE;
  } else if (v === 1) {
    util.warn('beta sample overflow, rounded to nearest representable support value');
    v = 1 - Number.EPSILON / 2;
  }
  return v;
}


// see lemma 6.1 from Ahrens & Dieter's
// Computer Methods for Sampling from Gamma, Beta, Poisson and Binomial Distributions
function binomialSample(p, n) {
  var k = 0;
  var N = 10;
  var a, b;
  while (n > N) {
    a = Math.floor(1 + n / 2);
    b = 1 + n - a;
    var x = betaSample(a, b);
    if (x >= p) {
      n = a - 1;
      p /= x;
    }
    else {
      k += a;
      n = b - 1;
      p = (p - x) / (1 - x);
    }
  }
  var u;
  for (var i = 0; i < n; i++) {
    u = util.random();
    if (u < p) {
      k++;
    }
  }
  return k || 0;
}

var Binomial = makeDistributionType({
  name: 'Binomial',
  desc: 'Distribution over the number of successes for ``n`` independent ``Bernoulli({p: p})`` trials.',
  params: [{name: 'p', desc: 'success probability', type: types.unitInterval},
           {name: 'n', desc: 'number of trials', type: types.positiveInt}],
  wikipedia: true,
  mixins: [finiteSupport],
  sample: function() {
    return binomialSample(ad.value(this.params.p), this.params.n);
  },
  score: function(val) {
    'use ad';
    var p = this.params.p;
    var n = this.params.n;

    if (!(typeof val === 'number' && val >= 0 && val <= n && val % 1 === 0)) {
      return -Infinity;
    }

    // exact formula is log{ binomial(n,x) * p^x * (1-p)^(n-x) }
    // = log(binomial(n,x)) + x*log(p) + (n-x)*log(1-p)
    // where binomial(n,x) is the binomial function

    // optimized computation of log(binomial(n,x))
    // binomial(n,x) is n! / (x! * (n-x)!)
    // compute the log of this:
    var logNumPermutations = 0;
    // let o be the larger of x and n-x
    // and m be the smaller
    var m, o;
    if (val < n - val) {
      m = val;
      o = n - val
    } else {
      m = n - val;
      o = val;
    }

    for (var i = o + 1; i <= n; i++) {
      logNumPermutations += Math.log(i);
    }
    logNumPermutations -= lnfactExact(m);

    return (logNumPermutations +
            // avoid returning 0 * -Infinity, which is NaN
            (val == 0 ? 0 : val * Math.log(p)) +
            (n - val == 0 ? 0 : (n - val) * Math.log(1 - p)));
  },
  support: function() {
    return _.range(0, this.params.n + 1);
  }
});


function zeros(n) {
  var a = new Array(n);
  for (var i = 0; i < n; i++) {
    a[i] = 0;
  }
  return a;
}

function multinomialSample(theta, n) {
  // var thetaSum = util.sum(theta);
  var a = zeros(theta.length);
  for (var i = 0; i < n; i++) {
    a[discreteSample(theta)]++;
  }
  return a;
}

var Multinomial = makeDistributionType({
  name: 'Multinomial',
  desc: 'Distribution over counts for ``n`` independent ``Discrete({ps: ps})`` trials.',
  params: [{name: 'ps', desc: 'probabilities', type: types.probabilityArray()},
           {name: 'n', desc: 'number of trials', type: types.positiveInt}],
  wikipedia: true,
  mixins: [finiteSupport],
  sample: function() {
    return multinomialSample(this.params.ps.map(ad.value), this.params.n);
  },
  score: function(val) {
    'use ad';
    if (sum(val) !== this.params.n) {
      return -Infinity;
    }
    var x = [];
    var y = [];
    for (var i = 0; i < this.params.ps.length; i++) {
      x[i] = lnfact(val[i]);
      y[i] = val[i] * Math.log(this.params.ps[i]);
    }
    return lnfact(this.params.n) - sum(x) + sum(y);
  },
  support: function() {
    // support of repeat(n, discrete(ps))
    var combinations = allDiscreteCombinations(this.params.n, this.params.ps, [], 0);
    var toHist = function(l) { return buildHistogramFromCombinations(l, this.params.ps); }.bind(this);
    var hists = combinations.map(toHist);
    return hists;
  }
});

// combinations of k (discrete) samples from states
function allDiscreteCombinations(k, states, got, pos) {
  var support = [];
  if (got.length == k) {
    return [_.clone(got)];
  }
  for (var i = pos; i < states.length; i++) {
    got.push(i);
    support = support.concat(allDiscreteCombinations(k, states, got, i));
    got.pop();
  }
  return support;
}

function buildHistogramFromCombinations(samples, states) {
  var stateIndices = _.range(states.length);
  // Build default histogram that has 0 for all state indices
  var zeroHist = (_.chain(stateIndices)
      .map(function(i) {return [i, 0];})
      .object()
      .value());
  // Now build actual histogram, keeping 0s for unsampled states
  var hist = _.defaults(_.countBy(samples), zeroHist);
  var array = _.sortBy(hist, function(val, key) { return key; });
  return array;
}


function fact(x) {
  'use ad';
  var t = 1;
  while (x > 1) {
    t *= x;
    x -= 1;
  }
  return t;
}

function lnfact(x) {
  'use ad';
  if (x < 1) {
    x = 1;
  }
  if (x < 12) {
    return Math.log(fact(Math.round(x)));
  }
  var invx = 1 / x;
  var invx2 = invx * invx;
  var invx3 = invx2 * invx;
  var invx5 = invx3 * invx2;
  var invx7 = invx5 * invx2;
  var sum = ((x + 0.5) * Math.log(x)) - x;
  sum += Math.log(2 * Math.PI) / 2;
  sum += (invx / 12) - (invx3 / 360);
  sum += (invx5 / 1260) - (invx7 / 1680);
  return sum;
}

function lnfactExact(x) {
  'use ad';
  if (x < 0) {
    throw new Error('lnfactExact called on negative argument ' + x);
  }
  if (x < 1) {
    x = 1;
  }
  var t = 0;
  while (x > 1) {
    t += Math.log(x);
    x -= 1;
  }
  return t;
}

var Poisson = makeDistributionType({
  name: 'Poisson',
  desc: 'Distribution over integers.',
  params: [{name: 'mu', desc: 'mean', type: types.positiveReal}],
  wikipedia: true,
  sample: function() {
    var k = 0;
    var mu = ad.value(this.params.mu);
    while (mu > 10) {
      var m = 7 / 8 * mu;
      var x = gammaSample(m, 1);
      if (x > mu) {
        return (k + binomialSample(mu / x, m - 1)) || 0;
      } else {
        mu -= x;
        k += m;
      }
    }
    var emu = Math.exp(-mu);
    var p = 1;
    do {
      p *= util.random();
      k++;
    } while (p > emu);
    return (k - 1) || 0;
  },
  score: function(val) {
    'use ad';
    return val * Math.log(this.params.mu) - this.params.mu - lnfact(val);
  }
});

function dirichletSample(alpha) {
  var n = alpha.dims[0];
  var ssum = 0;
  var theta = new Tensor([n, 1]);
  var t;

  // sample n gammas
  for (var i = 0; i < n; i++) {
    t = gammaSample(alpha.data[i], 1);
    theta.data[i] = t;
    ssum += t;
  }

  // normalize and catch under/overflow
  for (var j = 0; j < n; j++) {
    theta.data[j] /= ssum;
    if (theta.data[j] === 0) {
      theta.data[j] = Number.MIN_VALUE;
    }
    if (theta.data[j] === 1) {
      theta.data[j] = 1 - Number.EPSILON / 2;
    }
  }
  return theta;
}

function dirichletScore(alpha, val) {
  var _val = ad.value(val);
  var _alpha = ad.value(alpha);
  if (!util.isVector(_val) || !util.tensorEqDim0(_val, _alpha)) {
    return -Infinity;
  }

  return ad.scalar.add(
    ad.tensor.sumreduce(
      ad.tensor.sub(
        ad.tensor.mul(
          ad.tensor.sub(alpha, 1),
          ad.tensor.log(val)),
        ad.tensor.logGamma(alpha))),
    ad.scalar.logGamma(ad.tensor.sumreduce(alpha)));
}

var Dirichlet = makeDistributionType({
  name: 'Dirichlet',
  desc: 'Distribution over probability vectors. ' +
    'If ``alpha`` has length ``d`` then the distribution ' +
    'is over probability vectors of length ``d``.',
  params: [{name: 'alpha', desc: 'concentration', type: types.positiveVector}],
  wikipedia: true,
  mixins: [continuousSupport, noHMC],
  sample: function() {
    return dirichletSample(ad.value(this.params.alpha));
  },
  score: function(val) {
    return dirichletScore(this.params.alpha, val);
  }
});


function discreteSample(theta) {
  var thetaSum = util.sum(theta);
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



var Marginal = makeDistributionType({
  name: 'Marginal',
  nodoc: true,
  nohelper: true,
  params: [{name: 'dist'}],
  mixins: [finiteSupport],
  constructor: function() {
    'use ad';
    var norm = _.reduce(this.params.dist, function(acc, obj) {
      return acc + obj.prob;
    }, 0);
    assert.ok(Math.abs(1 - norm) < 1e-8, 'Expected marginal distribution to be normalized.');

    this.supp = _.map(this.params.dist, function(obj) {
      return obj.val;
    });

    this.getDist = function() {
      return this.params.dist;
    };
  },
  sample: function() {
    'use ad';
    var x = util.random();
    var dist = this.params.dist;
    var probAccum = 0;
    for (var i in dist) {
      if (dist.hasOwnProperty(i)) {
        probAccum += dist[i].prob;
        if (x < probAccum) {
          return dist[i].val;
        }
      }
    }
    return this.params.dist[i].val;
  },
  score: function(val) {
    'use ad';
    var obj = this.params.dist[util.serialize(val)];
    return obj ? Math.log(obj.prob) : -Infinity;
  },
  support: function() {
    return this.supp;
  },
  print: function() {
    return printMarginal(this.params.dist);
  }
});


// A "list of samples" backed marginal distribution that only
// aggregates the samples into a distribution when necessary.
var SampleBasedMarginal = makeDistributionType({
  name: 'SampleBasedMarginal',
  nodoc: true,
  nohelper: true,
  params: [{name: 'samples'}],
  mixins: [finiteSupport],
  constructor: function() {
    if (!_.isArray(this.params.samples) ||
        this.params.samples.length === 0) {
      throw new Error('Expected samples to be a non-empty array.');
    }

    // Provide access to the samples using the interface previously
    // provided by the `justSample` option.
    // samples is an array of objects like: {value: ..., score: ...}
    this.samples = this.params.samples;

    this.getDist = function() {
      if (this._cacheddist) {
        return this._cacheddist;
      } else {
        var dist = {};
        this.params.samples.forEach(function(obj) {
          var val = obj.value;
          var key = util.serialize(val);
          if (dist[key] === undefined) {
            dist[key] = {val: val, prob: 0};
          }
          dist[key].prob += 1;
        });
        // Normalize.
        var n = this.params.samples.length;
        _.each(dist, function(obj) { obj.prob /= n; });
        this._cacheddist = dist;
        return dist;
      }
    };
  },
  sample: function() {
    var n = this.params.samples.length;
    return this.params.samples[Math.floor(util.random() * n)].value;
  },
  score: function(val) {
    var key = util.serialize(val);
    var obj = this.getDist()[key];
    return (obj === undefined) ? -Infinity : Math.log(obj.prob);
  },
  support: function() {
    if (this.params.samples.length === 1) {
      // Optimization: Avoid unnecessary serialization in the
      // onlyMAP case
      return [this.params.samples[0].value];
    } else if (this._cachedsupport) {
      return this._cachedsupport;
    } else {
      var support = _.map(this.getDist(), _.property('val'));
      this._cachedsupport = support;
      return support;
    }
  },
  print: function() {
    return printMarginal(this.getDist());
  }
});

function printMarginal(dist) {
  return 'Marginal:\n' + _.map(dist, function(obj, val) { return [val, obj.prob]; })
    .sort(function(a, b) { return b[1] - a[1]; })
    .map(function(pair) { return '    ' + pair[0] + ' : ' + pair[1]; })
    .join('\n');
}


var Categorical = makeDistributionType({
  name: 'Categorical',
  desc: 'Distribution over elements of ``vs`` with ``P(vs[i])`` proportional to ``ps[i]``',
  params: [
    {name: 'ps', desc: 'probabilities (can be unnormalized)', type: types.nonNegativeVectorOrRealArray},
    {name: 'vs', desc: 'support', type: types.array(types.any)}],
  wikipedia: true,
  nohelper: true,
  mixins: [finiteSupport],
  constructor: function() {
    this.ixmap = _.object(this.params.vs.map(function(v, ix) {
      return [util.serialize(v), ix];
    }));
  },
  sample: function() {
    var ix = discreteSample(toUnliftedArray(this.params.ps));
    var vs = this.params.vs.map(ad.value);
    return vs[ix];
  },
  score: function(val) {
    var ix = this.ixmap[util.serialize(val)];
    return discreteScore(this.params.ps, ix);
  },
  support: function() {
    return this.params.vs;
  }
});

var Delta = makeDistributionType({
  name: 'Delta',
  desc: 'Discrete distribution that assigns probability one to the single ' +
      'element in its support. This is only useful in special circumstances as sampling ' +
      'from ``Delta({v: val})`` can be replaced with ``val`` itself. Furthermore, a ``Delta`` ' +
      'distribution parameterized by a random choice should not be used with MCMC based inference, ' +
      'as doing so produces incorrect results.',
  params: [{name: 'v', desc: 'support element'}],
  mixins: [finiteSupport],
  sample: function() {
    return ad.value(this.params.v);
  },
  score: function(val) {
    return ad.value(val) === ad.value(this.params.v) ? 0 : -Infinity;
  },
  support: function() {
    return [this.params.v];
  },
  base: function() {
    return this;
  },
  transform: function(x) {
    return this.params.v;
  }
});

function metadata() {
  return _.chain(distributions)
    .pairs() // pair[0] = key, pair[1] = value
    .sortBy(function(pair) { return pair[0]; })
    .map(function(pair) { return pair[1]; })
    .map(function(dist) { return dist.prototype.meta; })
    .value();
}

var distributions = {
  Uniform: Uniform,
  ImproperUniform: ImproperUniform,
  Bernoulli: Bernoulli,
  MultivariateBernoulli: MultivariateBernoulli,
  RandomInteger: RandomInteger,
  Gaussian: Gaussian,
  MultivariateGaussian: MultivariateGaussian,
  DiagCovGaussian: DiagCovGaussian,
  TensorGaussian: TensorGaussian,
  LogisticNormal: LogisticNormal,
  LogitNormal: LogitNormal,
  IspNormal: IspNormal,
  Cauchy: Cauchy,
  Discrete: Discrete,
  Gamma: Gamma,
  Exponential: Exponential,
  Beta: Beta,
  Binomial: Binomial,
  Multinomial: Multinomial,
  Poisson: Poisson,
  Dirichlet: Dirichlet,
  Marginal: Marginal,
  SampleBasedMarginal: SampleBasedMarginal,
  Categorical: Categorical,
  Delta: Delta
};

module.exports = _.assign({
  // rng
  betaSample: betaSample,
  binomialSample: binomialSample,
  discreteSample: discreteSample,
  gaussianSample: gaussianSample,
  tensorGaussianSample: tensorGaussianSample,
  gammaSample: gammaSample,
  dirichletSample: dirichletSample,
  // helpers
  serialize: serialize,
  deserialize: deserialize,
  squishToProbSimplex: squishToProbSimplex,
  isDist: isDist,
  metadata: metadata
}, distributions);
