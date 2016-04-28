////////////////////////////////////////////////////////////////////
// ERPs
//
// Elementary Random Primitives (ERPs) are the representation of
// distributions. They can have sampling, scoring, and support
// functions. A single ERP need not have all three, but some inference
// functions will complain if they're missing one.
//
// The main thing we can do with ERPs in WebPPL is feed them into the
// "sample" primitive to get a sample.
//
// required:
// - erp.sample() returns a value sampled from the distribution.
// - erp.score(val) returns the log-probability of val under the
//   distribution.
//
// Note that `sample` methods are responsible for un-lifting params as
// necessary.
//
// optional:
// - erp.support() gives either an array of support elements (for
//   discrete distributions with finite support) or an object with
//   'lower' and 'upper' properties (for continuous distributions with
//   bounded support).
// - erp.driftKernel(prevVal) is an erp for making mh proposals
//   conditioned on the previous value
//
// All erp should also satisfy the following:
//
// - All erp of a particular type should share the same set of
//   parameters.
// - All erp constructors should take a single params object argument
//   and store a reference to it as `this.params`. See `clone`.

'use strict';

var Tensor = require('./tensor');
var _ = require('underscore');
var util = require('./util');
var assert = require('assert');
var inspect = require('util').inspect;

var LOG_PI = 1.1447298858494002;
var LOG_2PI = 1.8378770664093453;

// This acts as a base class for all ERP.

function ERP() {}

ERP.prototype = {

  toJSON: function() {
    throw 'Not implemented';
  },

  inspect: function(depth, options) {
    if (_.has(this, 'params')) {
      return [this.name, '(', inspect(this.params), ')'].join('');
    } else {
      // This isn't an instance of an erp type, so reinspect while
      // ignoring this custom inspection method.
      var opts = options ? _.clone(options) : {};
      opts.customInspect = false;
      return inspect(this, opts);
    }
  },

  isContinuous: false,
  constructor: ERP

};

function isErp(x) {
  return x instanceof ERP;
}

function clone(erp) {
  return new erp.constructor(erp.params);
}

var serialize = function(erp) {
  return util.serialize(erp);
};

var deserialize = function(JSONString) {
  var obj = util.deserialize(JSONString);
  if (!obj.probs || !obj.support) {
    throw 'Cannot deserialize a non-ERP JSON object: ' + JSONString;
  }
  return new categorical({ps: obj.probs, vs: obj.support});
};

function isParams(x) {
  return typeof x === 'object' && !Array.isArray(x) && !ad.isLifted(x) && x !== null;
}

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


var methodNames = ['sample', 'score', 'support', 'print', 'driftKernel', 'base', 'transform'];

function makeErpType(options) {
  options = util.mergeDefaults(options, {
    parent: ERP,
    mixins: []
  });

  if (!_.has(options, 'name')) {
    throw 'makeErpType: name is required.';
  }

  // Note that Chrome uses the name of this local variable in the
  // output of `console.log` when it's called on an ERP that uses the
  // default constructor.
  var erp = _.has(options, 'constructor') ?
        options.constructor :
        function(params) { this.params = params; };

  erp.prototype = Object.create(options.parent.prototype);
  erp.prototype.constructor = erp;
  erp.prototype.name = options.name;

  _.extendOwn.apply(_, [erp.prototype].concat(options.mixins));
  _.extendOwn(erp.prototype, _.pick(options, methodNames));

  ['sample', 'score'].forEach(function(method) {
    if (!erp.prototype[method]) {
      throw 'makeErpType: method "' + method + '" not defined for ' + options.name;
    }
  });

  return erp;
}

// ERP

var uniform = makeErpType({
  name: 'uniform',
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



var bernoulli = makeErpType({
  name: 'bernoulli',
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

// TODO: Fix that the following return NaN rather than -Infinity.
// mvBernoulliERP.score([Vector([1, 0])], Vector([0, 0]));

// TODO: The support here is {0, 1}^n rather than {true, false} as in
// the univariate case.

function mvBernoulliScore(p, x) {
  assert.ok(ad.value(p).rank === 2);
  assert.ok(ad.value(p).dims[1] === 1);
  assert.ok(ad.value(x).rank === 2);
  assert.ok(ad.value(x).dims[1] === 1);
  assert.ok(ad.value(x).dims[0] === ad.value(p).dims[0]);

  var logp = ad.tensor.log(p);
  var xSub1 = ad.tensor.sub(x, 1);
  var pSub1 = ad.tensor.sub(p, 1);

  return ad.tensor.sumreduce(ad.tensor.sub(
    ad.tensor.mul(x, logp),
    ad.tensor.mul(xSub1, ad.tensor.log(ad.tensor.neg(pSub1)))
  ));
}


var mvBernoulli = makeErpType({
  name: 'mvBernoulli',
  mixins: [finiteSupport],
  sample: function() {
    var p = ad.value(this.params.p);
    assert.ok(p.rank === 2);
    assert.ok(p.dims[1] === 1);
    var d = p.dims[0];
    var x = new Tensor([d, 1]);
    var n = x.length;
    while (n--) {
      x.data[n] = util.random() < p.data[n];
    }
    return x;
  },
  score: function(x) {
    return mvBernoulliScore(this.params.p, x);
  }
});


var randomInteger = makeErpType({
  name: 'randomInteger',
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



var gaussian = makeErpType({
  name: 'gaussian',
  mixins: [continuousSupport],
  sample: function() {
    return gaussianSample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return gaussianScore(this.params.mu, this.params.sigma, x);
  },
  base: function() {
    return new gaussian({mu: 0, sigma: 1});
  },
  transform: function(x) {
    // Transform a sample x from the base distribution to the
    // distribution described by params.
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.scalar.add(ad.scalar.mul(sigma, x), mu);  }
});




var gaussianDrift = makeErpType({
  name: 'gaussianDrift',
  parent: gaussian,
  driftKernel: function(curVal) {
    return new gaussian({mu: curVal, sigma: this.params.sigma * 0.7});
  }
});


function mvGaussianSample(mu, cov) {
  assert.ok(mu.rank === 2);
  assert.ok(mu.dims[1] === 1);
  assert.ok(cov.rank === 2);
  assert.ok(cov.dims[0] === cov.dims[1]);
  assert.ok(mu.dims[0] === cov.dims[0]);
  var d = mu.dims[0];
  var z = new Tensor([d, 1]);
  for (var i = 0; i < d; i++) {
    z.data[i] = gaussianSample(0, 1);
  }
  var L = cov.cholesky();
  return L.dot(z).add(mu);
}

function mvGaussianScore(mu, cov, x) {
  var _mu = ad.value(mu);
  var _cov = ad.value(cov);
  assert.ok(_mu.rank === 2);
  assert.ok(_mu.dims[1] === 1);
  assert.ok(_cov.rank === 2);
  assert.ok(_cov.dims[0] === _cov.dims[1]);
  assert.ok(_mu.dims[0] === _cov.dims[0]);
  var d = _mu.dims[0];
  var dLog2Pi = d * LOG_2PI;
  var logDetCov = ad.scalar.log(ad.tensor.determinant(cov));
  var z = ad.tensor.sub(x, mu);
  var zT = ad.tensor.transpose(z);
  var prec = ad.tensor.inverse(cov);
  return ad.scalar.mul(-0.5, ad.scalar.add(
    dLog2Pi, ad.scalar.add(
      logDetCov,
      ad.tensorEntry(ad.tensor.dot(ad.tensor.dot(zT, prec), z), 0))));
}

var multivariateGaussian = makeErpType({
  name: 'multivariateGaussian',
  sample: function() {
    return mvGaussianSample(ad.value(this.params.mu), ad.value(this.params.cov));
  },
  score: function(val) {
    return mvGaussianScore(this.params.mu, this.params.cov, val);
  }
});


function diagCovGaussianSample(mu, sigma) {
  assert.strictEqual(mu.rank, 2);
  assert.strictEqual(sigma.rank, 2);
  assert.strictEqual(mu.dims[1], 1);
  assert.strictEqual(sigma.dims[1], 1);
  assert.strictEqual(mu.dims[0], sigma.dims[0]);
  var d = mu.dims[0];

  var x = new Tensor([d, 1]);
  var n = x.length;
  while (n--) {
    x.data[n] = gaussianSample(mu.data[n], sigma.data[n]);
  }
  return x;
}

function diagCovGaussianScore(mu, sigma, x) {
  var _mu = ad.value(mu);
  var _sigma = ad.value(sigma);

  assert.strictEqual(_mu.rank, 2);
  assert.strictEqual(_sigma.rank, 2);
  assert.strictEqual(_mu.dims[1], 1);
  assert.strictEqual(_sigma.dims[1], 1);
  assert.strictEqual(_mu.dims[0], _sigma.dims[0]);

  var d = _mu.dims[0];

  var dLog2Pi = d * LOG_2PI;
  var logDetCov = ad.scalar.mul(2, ad.tensor.sumreduce(ad.tensor.log(sigma)));
  var z = ad.tensor.div(ad.tensor.sub(x, mu), sigma);

  return ad.scalar.mul(-0.5, ad.scalar.add(
    dLog2Pi, ad.scalar.add(
      logDetCov,
      ad.tensor.sumreduce(ad.tensor.mul(z, z)))));
}

var diagCovGaussian = makeErpType({
  name: 'diagCovGaussian',
  mixins: [continuousSupport],
  sample: function() {
    return diagCovGaussianSample(ad.value(this.params.mu), ad.value(this.params.sigma));
  },
  score: function(x) {
    return diagCovGaussianScore(this.params.mu, this.params.sigma, x);
  },
  base: function() {
    var d = ad.value(this.params.mu).dims[0];
    var mu = new Tensor([d, 1]);
    var sigma = new Tensor([d, 1]).fill(1);
    return new diagCovGaussian({mu: mu, sigma: sigma});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return ad.tensor.add(ad.tensor.mul(sigma, x), mu);
  }
});


// TODO: Don't export this from here. I think we'll want to call it
// from wppl code, so move elsewhere.
var logistic = function(x) {
  // Map a d dimensional vector onto the d simplex.
  var d = ad.value(x).dims[0];
  var u = ad.tensor.reshape(ad.tensor.concat(x, ad.scalarsToTensor(0)), [d + 1, 1]);

  // // Numeric stability.
  // // TODO: Make this less messy.
  // // There's no Tensor max. Can't use Math.max.apply as Math.max is
  // // rewritten to use ad. The ad version only takes 2 args.
  // var max = ad.value(u).toFlatArray().reduce(function(a, b) { return Math.max(a, b); });
  // var v = ad.tensor.exp(ad.tensor.sub(u, max));
  // var ret = ad.tensor.div(v, ad.tensor.sumreduce(v));
  // return ret;

  // Use new softmax function here instead
  return ad.tensor.softmax(u);
};

// TODO: Generalize to allow correlations.

var logisticNormal = makeErpType({
  name: 'logisticNormalERP',
  mixins: [continuousSupport],
  sample: function() {
    return logistic(diagCovGaussianSample(ad.value(this.params.mu), ad.value(this.params.sigma)));
  },
  score: function(val) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    var _mu = ad.value(mu);
    var _sigma = ad.value(sigma);
    var _val = ad.value(val);

    assert.ok(_val.dims[0] - 1 === _mu.dims[0]);

    var d = _mu.dims[0];

    var u = ad.tensor.reshape(ad.tensor.range(val, 0, d), [d, 1]);

    var u_last = ad.tensorEntry(val, d);
    var inv = ad.tensor.log(ad.tensor.div(u, u_last));

    var normScore = diagCovGaussianScore(mu, sigma, inv);

    return ad.scalar.sub(normScore, ad.tensor.sumreduce(ad.tensor.log(val)));
  },
  base: function() {
    var d = ad.value(this.params.mu).dims[0];
    var mu = new Tensor([d, 1]);
    var sigma = new Tensor([d, 1]).fill(1);
    return new diagCovGaussian({mu: mu, sigma: sigma});
  },
  transform: function(x) {
    var mu = this.params.mu;
    var sigma = this.params.sigma;
    return logistic(ad.tensor.add(ad.tensor.mul(sigma, x), mu));
  }
});


function matrixGaussianScore(mu, sigma, dims, x) {
  var _x = ad.value(x);

  assert.ok(_.isNumber(mu));
  assert.ok(_.isNumber(sigma));
  assert.ok(_.isArray(dims));
  assert.strictEqual(dims.length, 2);
  assert.ok(_.isEqual(dims, _x.dims));

  var d = _x.length;
  var dLog2Pi = d * LOG_2PI;
  var _2dLogSigma = ad.scalar.mul(2 * d, ad.scalar.log(sigma));
  var sigma2 = ad.scalar.pow(sigma, 2);
  var xSubMu = ad.tensor.sub(x, mu);
  var z = ad.scalar.div(ad.tensor.sumreduce(ad.tensor.mul(xSubMu, xSubMu)), sigma2);

  return ad.scalar.mul(-0.5, ad.scalar.sum(dLog2Pi, _2dLogSigma, z));
}

// params: [mean, cov, [rows, cols]]

// Currently only supports the case where each dim is an independent
// Gaussian and mu and sigma are shared by all dims.

// It might be useful to extend this to allow mean to be a matrix etc.

var matrixGaussian = makeErpType({
  name: 'matrixGaussian',
  mixins: [continuousSupport],
  sample: function() {
    var mu = ad.value(this.params.mu);
    var sigma = ad.value(this.params.sigma);
    var dims = this.params.dims;

    assert.ok(_.isNumber(mu));
    assert.ok(_.isNumber(sigma));
    assert.strictEqual(dims.length, 2);

    var x = new Tensor(dims);
    var n = x.length;
    while (n--) {
      x.data[n] = gaussianSample(mu, sigma);
    }
    return x;
  },
  score: function(x) {
    return matrixGaussianScore(this.params.mu, this.params.sigma, this.params.dims, x);
  }
});


var delta = makeErpType({
  name: 'delta',
  mixins: [finiteSupport],
  sample: function() {
    return ad.value(this.params.v);
  },
  score: function(x) {
    // We really need a generic equality check here, but I might get
    // away with this for VI for now. Don't want to serialize as with
    // categorical as that's too slow for large matrices. matrices.
    assert.ok(this.params.v === x);
    return 0;
  },
  // TODO: Test reparameterization works.
  base: function() {
    return this;
  },
  transform: function(x) {
    return this.params.v;
  }
});


var cauchy = makeErpType({
  name: 'cauchy',
  mixins: [continuousSupport],
  sample: function() {
    var u = util.random();
    return ad.value(this.params.location) + ad.value(this.params.scale) * Math.tan(180 * (u - 0.5));
  },
  score: function(x) {
    'use ad';
    return -LOG_PI - Math.log(this.params.scale) - Math.log(1 + Math.pow((x - this.params.location) / this.params.scale, 2));
  }
});


function sum(xs) {
  'use ad';
  return xs.reduce(function(a, b) { return a + b; }, 0);
};


function discreteScore(probs, val) {
  var _probs = ad.value(probs);
  assert.ok(_probs.rank === 2);
  assert.ok(_probs.dims[1] === 1); // i.e. vector
  var d = _probs.dims[0];
  var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < d);
  return inSupport ?
      ad.scalar.log(ad.scalar.div(ad.tensorEntry(probs, val), ad.tensor.sumreduce(probs))) :
      -Infinity;
}

var discrete = makeErpType({
  name: 'discrete',
  mixins: [finiteSupport],
  sample: function() {
    return discreteSample(ad.value(this.params.ps).data);
  },
  score: function(val) {
    return discreteScore(this.params.ps, val);
  },
  support: function() {
    return _.range(ad.value(this.params.ps).length);
  }
});


var discreteOneHot = new ERP({
  sample: function(params) {
    var ps = params[0];
    var i = multinomialSample(ps.data);
    var d = ps.length;
    var x = new Tensor([d, 1]);
    x.data[i] = 1;
    return x;
  },
  score: function(params, x) {
    var ps = params[0];
    return ad.scalar.log(ad.tensor.sumreduce(ad.tensor.mul(ps, x)));
  },
  support: function(params) {
    var ps = ad.value(params[0]);
    var d = ps.length;
    return _.range(d).map(function(i) {
      var x = new Tensor([d, 1]);
      x.data[i] = 1;
      return x;
    });
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
    r = gammaSample(1 + shape, scale) + Math.log(util.random()) / shape;
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
  return (shape - 1) * x - Math.exp(x) / scale - Math.logGamma(shape) - shape * Math.log(scale);
}


var gamma = makeErpType({
  name: 'gamma',
  mixins: [continuousSupport],
  sample: function() {
    return gammaSample(ad.value(this.params.shape), ad.value(this.params.scale));
  },
  score: function(x) {
    'use ad';
    var shape = this.params.shape;
    var scale = this.params.scale;
    return (shape - 1) * Math.log(x) - x / scale - Math.logGamma(shape) - shape * Math.log(scale);
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});


var exponential = makeErpType({
  name: 'exponential',
  mixins: [continuousSupport],
  sample: function() {
    var u = util.random();
    return Math.log(u) / (-1 * ad.value(this.params.a));
  },
  score: function(val) {
    'use ad';
    return Math.log(this.params.a) - this.params.a * val;
  },
  support: function() {
    return { lower: 0, upper: Infinity };
  }
});


function logBeta(a, b) {
  'use ad';
  return Math.logGamma(a) + Math.logGamma(b) - Math.logGamma(a + b);
}




var beta = makeErpType({
  name: 'beta',
  mixins: [continuousSupport],
  sample: function() {
    return betaSample(ad.value(this.params.a), ad.value(this.params.b));
  },
  score: function(x) {
    'use ad';
    return ((x > 0 && x < 1) ?
            (this.params.a - 1) * Math.log(x) + (this.params.b - 1) * Math.log(1 - x) - logBeta(this.params.a, this.params.b) :
            -Infinity);
  },
  support: function() {
    return { lower: 0, upper: 1 };
  }
});

function betaSample(a, b) {
  var x = gammaSample(a, 1);
  return x / (x + gammaSample(b, 1));
}


function binomialG(x) {
  'use ad';
  if (x === 0) {
    return 1;
  }
  if (x === 1) {
    return 0;
  }
  var d = 1 - x;
  return (1 - (x * x) + (2 * x * Math.log(x))) / (d * d);
}

function binomialSample(p, n) {
  var k = 0;
  var N = 10;
  var a, b;
  while (n > N) {
    a = 1 + n / 2;
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

var binomial = makeErpType({
  name: 'binomial',
  mixins: [finiteSupport],
  sample: function() {
    return binomialSample(ad.value(this.params.p), this.params.n);
  },
  score: function(val) {
    'use ad';
    var p = this.params.p;
    var n = this.params.n;
    if (n > 20 && n * p > 5 && n * (1 - p) > 5) {
      // large n, reasonable p approximation
      var s = val;
      var inv2 = 1 / 2;
      var inv3 = 1 / 3;
      var inv6 = 1 / 6;
      if (s >= n) {
        return -Infinity;
      }
      var q = 1 - p;
      var S = s + inv2;
      var T = n - s - inv2;
      var d1 = s + inv6 - (n + inv3) * p;
      var d2 = q / (s + inv2) - p / (T + inv2) + (q - inv2) / (n + 1);
      d2 = d1 + 0.02 * d2;
      var num = 1 + q * binomialG(S / (n * p)) + p * binomialG(T / (n * q));
      var den = (n + inv6) * p * q;
      var z = num / den;
      var invsd = Math.sqrt(z);
      z = d2 * invsd;
      return gaussianScore(0, 1, z) + Math.log(invsd);
    } else {
      // exact formula
      return (lnfact(n) - lnfact(n - val) - lnfact(val) +
          val * Math.log(p) + (n - val) * Math.log(1 - p));
    }
  },
  support: function() {
    return _.range(this.params.n).concat(this.params.n);
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
  var thetaSum = util.sum(theta);
  var a = zeros(theta.length);
  for (var i = 0; i < n; i++) {
    a[discreteSample(theta)]++;
  }
  return a;
}

var multinomial = makeErpType({
  name: 'multinomial',
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
    for (var i = 0; i < this.params.ps.length; i++){
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
                   .map(function(i){return [i, 0];})
                   .object()
                   .value());
  // Now build actual histogram, keeping 0s for unsampled states
  var hist = _.defaults(_.countBy(samples), zeroHist);
  var array = _.sortBy(hist, function(val, key){ return key; });
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



var poisson = makeErpType({
  name: 'poisson',
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
  assert.ok(alpha.rank === 2);
  assert.ok(alpha.dims[1] === 1); // i.e. vector
  var d = alpha.dims[0];
  var ssum = 0;
  var theta = new Tensor([d, 1]);
  var t;
  for (var i = 0; i < d; i++) {
    t = gammaSample(alpha.data[i], 1);
    theta.data[i] = t;
    ssum += t;
  }
  for (var j = 0; j < d; j++) {
    theta.data[j] /= ssum;
  }
  return theta;
}

function dirichletScore(alpha, val) {
  var _alpha = ad.value(alpha);
  var _val = ad.value(val);

  assert.ok(_alpha.rank === 2);
  assert.ok(_alpha.dims[1] === 1); // i.e. vector
  assert.ok(_val.rank === 2);
  assert.ok(_val.dims[1] === 1); // i.e. vector
  assert.ok(_alpha.dims[0] === _val.dims[0]);

  return ad.scalar.add(
    ad.tensor.sumreduce(
      ad.tensor.sub(
        ad.tensor.mul(
          ad.tensor.sub(alpha, 1),
          ad.tensor.log(val)),
        ad.tensor.logGamma(alpha))),
    ad.scalar.logGamma(ad.tensor.sumreduce(alpha)));
}

var dirichlet = makeErpType({
  name: 'dirichlet',
  sample: function() {
    return dirichletSample(ad.value(this.params.alpha));
  },
  score: function(val) {
    return dirichletScore(this.params.alpha, val);
  }
});



var dirichletDrift = makeErpType({
  name: 'dirichletDrift',
  parent: dirichlet,
  driftKernel: function(prevVal) {
    var concentration = 10;
    var alpha = prevVal.map(function(x) { return concentration * x; });
    return new dirichlet({alpha: alpha});
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



var marginal = makeErpType({
  name: 'marginal',
  mixins: [finiteSupport],
  constructor: function(params) {
    'use ad';
    this.params = params;

    var norm = _.reduce(this.params.dist, function(acc, obj) {
      return acc + obj.prob;
    }, 0);
    assert.ok(Math.abs(1 - norm) < 1e-8, 'Expected marginal distribution to be normalized.');

    this.supp = _.map(this.params.dist, function(obj) {
      return obj.val;
    });
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
    return _.map(this.params.dist, function(obj, val) { return [val, obj.prob]; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .map(function(pair) { return '    ' + pair[0] + ' : ' + pair[1]; })
      .join('\n');
  }
});


var categorical = makeErpType({
  name: 'categorical',
  mixins: [finiteSupport],
  constructor: function(params) {
    // ps is expected to be normalized.
    this.params = params;
    this.dist = _.object(this.params.vs.map(function(v, i) {
      return [util.serialize(v), { val: v, prob: this.params.ps[i] }];
    }, this));
  },
  sample: function() {
    var vs = this.params.vs.map(ad.value);
    var ps = this.params.ps.map(ad.value);
    return vs[discreteSample(ps)];
  },
  score: function(val) {
    'use ad';
    var obj = this.dist[util.serialize(val)];
    return obj ? Math.log(obj.prob) : -Infinity;
  },
  support: function() {
    return this.params.vs;
  }
});

function withImportanceDist(erp, importanceERP) {
  var newERP = clone(erp);
  newERP.importanceERP = importanceERP;
  return newERP;
}

module.exports = {
  // erp
  uniform: uniform,
  bernoulli: bernoulli,
  mvBernoulli: mvBernoulli,
  randomInteger: randomInteger,
  gaussian: gaussian,
  gaussianDrift: gaussianDrift,
  multivariateGaussian: multivariateGaussian,
  diagCovGaussian: diagCovGaussian,
  matrixGaussian: matrixGaussian,
  logisticNormal: logisticNormal,
  cauchy: cauchy,
  discrete: discrete,
  discreteOneHot: discreteOneHot,
  gamma: gamma,
  exponential: exponential,
  beta: beta,
  binomial: binomial,
  multinomial: multinomial,
  poisson: poisson,
  dirichlet: dirichlet,
  dirichletDrift: dirichletDrift,
  marginal: marginal,
  categorical: categorical,
  delta: delta,
  // rng
  discreteSample: discreteSample,
  gaussianSample: gaussianSample,
  gammaSample: gammaSample,
  // helpers
  serialize: serialize,
  deserialize: deserialize,
  withImportanceDist: withImportanceDist,
  logistic: logistic,
  isErp: isErp,
  isParams: isParams
};
