////////////////////////////////////////////////////////////////////
// ERPs
//
// Elementary Random Primitives (ERPs) are the representation of
// distributions. They can have sampling, scoring, and support
// functions. A single ERP need not have all three, but some inference
// functions will complain if they're missing one.
//
// The main thing we can do with ERPs in WebPPL is feed them into the
// "sample" primitive to get a sample. At top level we will also have
// some "inspection" functions to visualize them?
//
// required:
// - erp.sample(params) returns a value sampled from the distribution.
// - erp.score(params, val) returns the log-probability of val under the distribution.
//
// optional:
// - erp.support(params) gives an array of support elements.
// - erp.grad(params, val) gives the gradient of score at val wrt params.
// - erp.proposer is an erp for making mh proposals conditioned on the previous value

'use strict';

var numeric = require('numeric');
var _ = require('underscore');
var util = require('./util');
var assert = require('assert');

var LOG_2PI = 1.8378770664093453;

function ERP(obj) {
  assert(obj.sample && obj.score, 'ERP must implement sample and score.');
  _.extendOwn(this, obj);
}

ERP.prototype.isContinuous = function() {
  return !this.support
}

ERP.prototype.MAP = function() {
  if (this.support === undefined)
    throw 'Cannot compute MAP for ERP without support!'
  var supp = this.support([]);
  var mapEst = {val: undefined, prob: 0};
  for (var i = 0, l = supp.length; i < l; i++) {
    var sp = supp[i];
    var sc = Math.exp(this.score([], sp))
    if (sc > mapEst.prob) mapEst = {val: sp, prob: sc};
  }
  this.MAP = function() {return mapEst};
  return mapEst;
};

ERP.prototype.entropy = function() {
  if (this.support === undefined)
    throw 'Cannot compute entropy for ERP without support!'
  var supp = this.support([]);
  var e = 0;
  for (var i = 0, l = supp.length; i < l; i++) {
    var lp = this.score([], supp[i]);
    e -= Math.exp(lp) * lp;
  }
  this.entropy = function() {return e};
  return e;
};

ERP.prototype.parameterized = true;

ERP.prototype.withParameters = function(params) {
  var erp = new ERP(this);
  var sampler = this.sample;
  erp.sample = function(ps) {return sampler(params)};
  var scorer = this.score;
  erp.score = function(ps, val) {return scorer(params, val)};
  if (this.support) {
    var support = this.support;
    erp.support = function(ps) {return support(params)};
  }
  erp.parameterized = false;
  return erp;
};

ERP.prototype.isSerializeable = function() {
  return this.support && !this.parameterized;
};

// ERP serializer (allows JSON.stringify)
ERP.prototype.toJSON = function() {
  if (this.isSerializeable()) {
    var support = this.support([]);
    var probs = support.map(function(s) {return Math.exp(this.score([], s));}, this);
    var erpJSON = {probs: probs, support: support};
    this.toJSON = function() {return erpJSON};
    return erpJSON;
  } else {
    throw 'Cannot serialize ' + this.name + ' ERP.';
  }
};

ERP.prototype.print = function() {
  if (this.isSerializeable()) {
    console.log('ERP:');
    var json = this.toJSON();
    _.zip(json.probs, json.support)
      .sort(function(a, b) { return b[0] - a[0]; })
      .forEach(function(val) {
          console.log('    ' + util.serialize(val[1]) + ' : ' + val[0]);
        });
  } else {
    console.log('[ERP: ' + this.name + ']');
  }
};

var serializeERP = function(erp) {
  return util.serialize(erp);
};

// ERP deserializers
var deserializeERP = function(JSONString) {
  var obj = util.deserialize(JSONString);
  if (!obj.probs || !obj.support) {
    throw 'Cannot deserialize a non-ERP JSON object: ' + JSONString;
  }
  return makeCategoricalERP(obj.probs,
                            obj.support,
                            _.omit(obj, 'probs', 'support'));
};

var uniformERP = new ERP({
  sample: function(params) {
    var u = util.random();
    return (1 - u) * params[0] + u * params[1];
  },
  score: function(params, val) {
    if (val < params[0] || val > params[1]) {
      return -Infinity;
    }
    return -Math.log(params[1] - params[0]);
  }
});

var bernoulliERP = new ERP({
  sample: function(params) {
    var weight = params[0];
    var val = util.random() < weight;
    return val;
  },
  score: function(params, val) {
    if (val !== true && val !== false) {
      return -Infinity;
    }
    var weight = params[0];
    return val ? Math.log(weight) : Math.log(1 - weight);
  },
  support: function(params) {
    return [true, false];
  },
  grad: function(params, val) {
    //FIXME: check domain
    var weight = params[0];
    return val ? [1 / weight] : [-1 / weight];
  }
});



var randomIntegerERP = new ERP({
  sample: function(params) {
    return Math.floor(util.random() * params[0]);
  },
  score: function(params, val) {
    var stop = params[0];
    var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < stop);
    return inSupport ? -Math.log(stop) : -Infinity;
  },
  support: function(params) {
    return _.range(params[0]);
  }
});

function gaussianSample(params) {
  var mu = params[0];
  var sigma = params[1];
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

function gaussianScore(params, x) {
  var mu = params[0];
  var sigma = params[1];
  return -0.5 * (LOG_2PI + 2 * Math.log(sigma) + (x - mu) * (x - mu) / (sigma * sigma));
}

var gaussianERP = new ERP({ sample: gaussianSample, score: gaussianScore });

function multivariateGaussianSample(params) {
  var mu = params[0];
  var cov = params[1];
  var xs = mu.map(function() {return gaussianSample([0, 1]);});
  var svd = numeric.svd(cov);
  var scaledV = numeric.transpose(svd.V).map(function(x) {
    return numeric.mul(numeric.sqrt(svd.S), x);
  });
  xs = numeric.dot(xs, numeric.transpose(scaledV));
  return numeric.add(xs, mu);
}

function multivariateGaussianScore(params, x) {
  var mu = params[0];
  var cov = params[1];
  var n = mu.length;
  var coeffs = n * LOG_2PI + Math.log(numeric.det(cov));
  var xSubMu = numeric.sub(x, mu);
  var exponents = numeric.dot(numeric.dot(xSubMu, numeric.inv(cov)), xSubMu);
  return -0.5 * (coeffs + exponents);
}

var multivariateGaussianERP = new ERP({
  sample: multivariateGaussianSample,
  score: multivariateGaussianScore
});

var discreteERP = new ERP({
  sample: function(params) {
    return multinomialSample(params[0]);
  },
  score: function(params, val) {
    var probs = util.normalizeArray(params[0]);
    var stop = probs.length;
    var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < stop);
    return inSupport ? Math.log(probs[val]) : -Infinity;
  },
  support: function(params) {
    return _.range(params[0].length);
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
  var x = xx - 1.0;
  var tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  var ser = 1.000000000190015;
  for (var j = 0; j <= 5; j++) {
    x++;
    ser += gammaCof[j] / x;
  }
  return -tmp + Math.log(2.5066282746310005 * ser);
}

function gammaSample(params) {
  var a = params[0];
  var b = params[1];
  if (a < 1) {
    return gammaSample([1 + a, b]) * Math.pow(util.random(), 1 / a);
  }
  var x, v, u;
  var d = a - 1 / 3;
  var c = 1 / Math.sqrt(9 * d);
  while (true) {
    do {
      x = gaussianSample([0, 1]);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    u = util.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return b * d * v;
    }
  }
}

// params are shape and scale
var gammaERP = new ERP({
  sample: gammaSample,
  score: function(params, val) {
    var a = params[0];
    var b = params[1];
    var x = val;
    return (a - 1) * Math.log(x) - x / b - logGamma(a) - a * Math.log(b);
  }
});

var exponentialERP = new ERP({
  sample: function(params) {
    var a = params[0];
    var u = util.random();
    return Math.log(u) / (-1 * a);
  },
  score: function(params, val) {
    var a = params[0];
    return Math.log(a) - a * val;
  }
});

function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function betaSample(params) {
  var a = params[0];
  var b = params[1];
  var x = gammaSample([a, 1]);
  return x / (x + gammaSample([b, 1]));
}

var betaERP = new ERP({
  sample: betaSample,
  score: function(params, val) {
    var a = params[0];
    var b = params[1];
    var x = val;
    return ((x > 0 && x < 1) ?
        (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b) :
        -Infinity);
  }
});

function binomialG(x) {
  if (x === 0) {
    return 1;
  }
  if (x === 1) {
    return 0;
  }
  var d = 1 - x;
  return (1 - (x * x) + (2 * x * Math.log(x))) / (d * d);
}

function binomialSample(params) {
  var p = params[0];
  var n = params[1];
  var k = 0;
  var N = 10;
  var a, b;
  while (n > N) {
    a = 1 + n / 2;
    b = 1 + n - a;
    var x = betaSample([a, b]);
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

var binomialERP = new ERP({
  sample: binomialSample,
  score: function(params, val) {
    var p = params[0];
    var n = params[1];
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
      return gaussianScore([0, 1], z) + Math.log(invsd);
    } else {
      // exact formula
      return (lnfact(n) - lnfact(n - val) - lnfact(val) +
          val * Math.log(p) + (n - val) * Math.log(1 - p));
    }
  },
  support: function(params) {
    return _.range(params[1]).concat([params[1]]);
  }
});

function fact(x) {
  var t = 1;
  while (x > 1) {
    t *= x--;
  }
  return t;
}

function lnfact(x) {
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

var poissonERP = new ERP({
  sample: function(params) {
    var mu = params[0];
    var k = 0;
    while (mu > 10) {
      var m = 7 / 8 * mu;
      var x = gammaSample([m, 1]);
      if (x > mu) {
        return (k + binomialSample([mu / x, m - 1])) || 0;
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
  score: function(params, val) {
    var mu = params[0];
    var k = val;
    return k * Math.log(mu) - mu - lnfact(k);
  }
});

function dirichletSample(params) {
  var alpha = params;
  var ssum = 0;
  var theta = [];
  var t;
  for (var i = 0; i < alpha.length; i++) {
    t = gammaSample([alpha[i], 1]);
    theta[i] = t;
    ssum = ssum + t;
  }
  for (var j = 0; j < theta.length; j++) {
    theta[j] /= ssum;
  }
  return theta;
}

function dirichletScore(params, val) {
  var alpha = params;
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

var dirichletERP = new ERP({ sample: dirichletSample, score: dirichletScore });

function multinomialSample(theta) {
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

// Make a discrete ERP from a {val: prob, etc.} object (unormalized).
function makeMarginalERP(marginal) {
  assert.ok(_.size(marginal) > 0);
  // Normalize distribution:
  var norm = -Infinity;
  var supp = [];
  for (var v in marginal) {if (marginal.hasOwnProperty(v)) {
    var d = marginal[v];
    norm = util.logsumexp([norm, d.prob]);
    supp.push(d.val);
  }}
  var mapEst = {val: undefined, prob: 0};
  for (v in marginal) {if (marginal.hasOwnProperty(v)) {
    var dd = marginal[v];
    var nprob = dd.prob - norm;
    var nprobS = Math.exp(nprob)
    if (nprobS > mapEst.prob)
      mapEst = {val: dd.val, prob: nprobS};
    marginal[v].prob = nprobS;
  }}

  // Make an ERP from marginal:
  var dist = new ERP({
    sample: function(params) {
      var x = util.random();
      var probAccum = 0;
      for (var i in marginal) {
        if (marginal.hasOwnProperty(i)) {
          probAccum += marginal[i].prob;
          if (x < probAccum) {
            return marginal[i].val;
          }
        }
      }
      return marginal[i].val;
    },
    score: function(params, val) {
      var lk = marginal[JSON.stringify(val)];
      return lk ? Math.log(lk.prob) : -Infinity;
    },
    support: function(params) {
      return supp;
    },
    parameterized: false,
    name: 'marginal'
  });

  dist.MAP = function() {return mapEst};
  return dist;
}

// note: ps is expected to be normalized
var makeCategoricalERP = function(ps, vs, extraParams) {
  var dist = {};
  vs.forEach(function(v, i) {dist[JSON.stringify(v)] = {val: v, prob: ps[i]}})
  var categoricalSample = vs.length === 1 ?
      function(params) { return vs[0]; } :
      function(params) { return vs[multinomialSample(ps)]; };
  return new ERP(_.extendOwn({
    sample: categoricalSample,
    score: function(params, val) {
      var lk = dist[JSON.stringify(val)];
      return lk ? Math.log(lk.prob) : -Infinity;
    },
    support: function(params) { return vs; },
    parameterized: false,
    name: 'categorical'
  }, extraParams));
};

// Make a parameterized ERP that selects among multiple (unparameterized) ERPs
var makeMultiplexERP = function(vs, erps) {
  var stringifiedVals = vs.map(JSON.stringify);
  var selectERP = function(params) {
    var stringifiedV = JSON.stringify(params[0]);
    var i = _.indexOf(stringifiedVals, stringifiedV);
    if (i === -1) {
      return undefined;
    } else {
      return erps[i];
    }
  };
  return new ERP({
    sample: function(params) {
      var erp = selectERP(params);
      assert.notEqual(erp, undefined);
      return erp.sample();
    },
    score: function(params, val) {
      var erp = selectERP(params);
      if (erp === undefined) {
        return -Infinity;
      } else {
        return erp.score([], val);
      }
    },
    support: function(params) {
      var erp = selectERP(params);
      return erp.support();
    },
    name: 'multiplex'
  });
};

function gaussianProposalParams(params, prevVal) {
  var mu = prevVal;
  var sigma = params[1] * 0.7;
  return [mu, sigma];
}

function dirichletProposalParams(params, prevVal) {
  var concentration = 0.1;
  var driftParams = params.map(function(x) {return concentration * x});
  return driftParams;
}

function buildProposer(baseERP, getProposalParams) {
  return new ERP({
    sample: function(params) {
      var baseParams = params[0];
      var prevVal = params[1];
      var proposalParams = getProposalParams(baseParams, prevVal);
      return baseERP.sample(proposalParams);
    },
    score: function(params, val) {
      var baseParams = params[0];
      var prevVal = params[1];
      var proposalParams = getProposalParams(baseParams, prevVal);
      return baseERP.score(proposalParams, val);
    }
  });
}

var gaussianProposerERP = buildProposer(gaussianERP, gaussianProposalParams);
var dirichletProposerERP = buildProposer(dirichletERP, dirichletProposalParams);

var gaussianDriftERP = new ERP({
  sample: gaussianERP.sample,
  score: gaussianERP.score,
  proposer: gaussianProposerERP
});

var dirichletDriftERP = new ERP({
  sample: dirichletERP.sample,
  score: dirichletERP.score,
  proposer: dirichletProposerERP
});

function withImportanceDist(s, k, a, erp, importanceERP) {
  var newERP = _.clone(erp);
  newERP.importanceERP = importanceERP;
  return k(s, newERP);
}

function isErp(x) {
  return x && _.isFunction(x.score) && _.isFunction(x.sample);
}

function isErpWithSupport(x) {
  return isErp(x) && _.isFunction(x.support);
}

function setErpNames(exports) {
  return _.each(exports, function(val, key) {
    if (isErp(val)) {
      val.name = key.replace(/ERP$/, '');
    }
  });
}

module.exports = setErpNames({
  ERP: ERP,
  serializeERP: serializeERP,
  deserializeERP: deserializeERP,
  bernoulliERP: bernoulliERP,
  betaERP: betaERP,
  binomialERP: binomialERP,
  dirichletERP: dirichletERP,
  discreteERP: discreteERP,
  exponentialERP: exponentialERP,
  gammaERP: gammaERP,
  gaussianERP: gaussianERP,
  multinomialSample: multinomialSample,
  multivariateGaussianERP: multivariateGaussianERP,
  poissonERP: poissonERP,
  randomIntegerERP: randomIntegerERP,
  uniformERP: uniformERP,
  makeMarginalERP: makeMarginalERP,
  makeCategoricalERP: makeCategoricalERP,
  makeMultiplexERP: makeMultiplexERP,
  gaussianDriftERP: gaussianDriftERP,
  dirichletDriftERP: dirichletDriftERP,
  gaussianProposerERP: gaussianProposerERP,
  dirichetProposerERP: dirichletProposerERP,
  withImportanceDist: withImportanceDist,
  isErp: isErp,
  isErpWithSupport: isErpWithSupport
});
