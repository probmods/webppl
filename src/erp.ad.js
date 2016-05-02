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
// - erp.grad(val) gives the gradient of score at val wrt params.
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

var numeric = require('numeric');
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


var methodNames = ['sample', 'score', 'support', 'grad', 'print', 'driftKernel'];

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
  },
  grad: function(val) {
    //FIXME: check domain
    return val ? [1 / this.params.p] : [-1 / this.params.p];
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
  }
});




var gaussianDrift = makeErpType({
  name: 'gaussianDrift',
  parent: gaussian,
  driftKernel: function(curVal) {
    return new gaussian({mu: curVal, sigma: this.params.sigma * 0.7});
  }
});


function multivariateGaussianSample(mu, cov) {
  var xs = mu.map(function() {return gaussianSample(0, 1);});
  var svd = numeric.svd(cov);
  var scaledV = numeric.transpose(svd.V).map(function(x) {
    return numeric.mul(numeric.sqrt(svd.S), x);
  });
  xs = numeric.dot(xs, numeric.transpose(scaledV));
  return numeric.add(xs, mu);
}

function multivariateGaussianScore(mu, cov, x) {
  var n = mu.length;
  var coeffs = n * LOG_2PI + Math.log(numeric.det(cov));
  var xSubMu = numeric.sub(x, mu);
  var exponents = numeric.dot(numeric.dot(xSubMu, numeric.inv(cov)), xSubMu);
  return -0.5 * (coeffs + exponents);
}


var multivariateGaussian = makeErpType({
  name: 'multivariateGaussian',
  sample: function() {
    return multivariateGaussianSample(this.params.mu, this.params.cov);
  },
  score: function(val) {
    return multivariateGaussianScore(this.params.mu, this.params.cov, val);
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


var discrete = makeErpType({
  name: 'discrete',
  mixins: [finiteSupport],
  sample: function() {
    return discreteSample(this.params.ps.map(ad.value));
  },
  score: function(val) {
    'use ad';
    var n = this.params.ps.length;
    var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < n);
    return inSupport ? Math.log(this.params.ps[val] / sum(this.params.ps)) : -Infinity;
  },
  support: function(params) {
    return _.range(this.params.ps.length);
  }
});


var gammaCof = [
  76.18009172947146,
  -86.50532032941677,
  24.01409824083091,
  -1.231739572450155,
  0.1208650973866179e-2,
  -0.5395239384953e-5];

function logGamma(xx) {
  'use ad';
  var x = xx - 1.0;
  var tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  var ser = 1.000000000190015;
  for (var j = 0; j <= 5; j++) {
    x += 1;
    ser += gammaCof[j] / x;
  }
  return -tmp + Math.log(2.5066282746310005 * ser);
}

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
  return (shape - 1) * x - Math.exp(x) / scale - logGamma(shape) - shape * Math.log(scale);
}


var gamma = makeErpType({
  name: 'gamma',
  mixins: [continuousSupport],
  sample: function() {
    return gammaSample(ad.value(this.params.shape), ad.value(this.params.scale));
  },
  score: function(x) {
    'use ad';
    return (this.params.shape - 1) * Math.log(x) - x / this.params.scale - logGamma(this.params.shape) - this.params.shape * Math.log(this.params.scale);
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
  return logGamma(a) + logGamma(b) - logGamma(a + b);
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
  var ssum = 0;
  var theta = [];
  var t;
  for (var i = 0; i < alpha.length; i++) {
    t = gammaSample(alpha[i], 1);
    theta[i] = t;
    ssum = ssum + t;
  }
  for (var j = 0; j < theta.length; j++) {
    theta[j] /= ssum;
  }
  return theta;
}

function dirichletScore(alpha, val) {
  var theta = val;
  var asum = 0;
  for (var i = 0; i < alpha.length; i++) {
    asum += alpha[i];
  }
  var logp = logGamma(asum);
  for (var j = 0; j < alpha.length; j++) {
    logp += (alpha[j] - 1) * Math.log(theta[j]);
    logp -= logGamma(alpha[j]);
  }
  return logp;
}

var dirichlet = makeErpType({
  name: 'dirichlet',
  sample: function() {
    return dirichletSample(this.params.alpha);
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
  randomInteger: randomInteger,
  gaussian: gaussian,
  gaussianDrift: gaussianDrift,
  multivariateGaussian: multivariateGaussian,
  cauchy: cauchy,
  discrete: discrete,
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
  // rng
  discreteSample: discreteSample,
  gaussianSample: gaussianSample,
  gammaSample: gammaSample,
  // helpers
  serialize: serialize,
  deserialize: deserialize,
  withImportanceDist: withImportanceDist,
  isErp: isErp,
  isParams: isParams
};
