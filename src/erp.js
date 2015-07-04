////////////////////////////////////////////////////////////////////
// ERPs
//
// Elementary Random Primitives (ERPs) are the representation of
// distributions. They can have sampling, scoring, and support
// functions. A single ERP need not hve all three, but some inference
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

// var numeric = require('numeric');
var _ = require('underscore');
var util = require('./util.js');
var erpScorers = require('./erpScorers.js');

function ERP(sampler, scorer, auxParams) {
  auxParams = typeof auxParams === 'undefined' ? {} : auxParams;
  this.sample = sampler;
  this.score = scorer;
  for (var key in auxParams) {
    if (auxParams.hasOwnProperty(key)) {
      this[key] = auxParams[key];
    }
  }
}

ERP.prototype.isContinuous = function() {
  return !this.support
}

ERP.prototype.MAP = function() {
  return erpScorers.MAP.apply(this);
}

ERP.prototype.entropy = function() {
  return erpScorers.entropy.apply(this);
}

var uniformERP = new ERP(
    function uniformSample(params) {
      var u = Math.random();
      return (1 - u) * params[0] + u * params[1];
    },
    erpScorers.uniformScore
    );

var bernoulliERP = new ERP(
    function flipSample(params) {
      var weight = params[0];
      var val = Math.random() < weight;
      return val;
    },
    erpScorers.flipScore,
    {
      support: function flipSupport(params) {
        return [true, false];
      },
      grad: function flipGrad(params, val) {
        //FIXME: check domain
        var weight = params[0];
        return val ? [1 / weight] : [-1 / weight];
      }
    }
    );

var randomIntegerERP = new ERP(
    function randomIntegerSample(params) {
      return Math.floor(Math.random() * params[0]);
    },
    erpScorers.randomIntegerScore,
    {
      support: function randomIntegerSupport(params) {
        return _.range(params[0]);
      }
    }
    );

function gaussianSample(params) {
  var mu = params[0];
  var sigma = params[1];
  var u, v, x, y, q;
  do {
    u = 1 - Math.random();
    v = 1.7156 * (Math.random() - 0.5);
    x = u - 0.449871;
    y = Math.abs(v) + 0.386595;
    q = x * x + y * (0.196 * y - 0.25472 * x);
  } while (q >= 0.27597 && (q > 0.27846 || v * v > -4 * u * u * Math.log(u)));
  return mu + sigma * v / u;
}

var gaussianERP = new ERP(gaussianSample, erpScorers.gaussianScore);

// function multivariateGaussianSample(params) {
//   var mu = params[0];
//   var cov = params[1];
//   var xs = mu.map(function() {return gaussianSample([0, 1]);});
//   var svd = numeric.svd(cov);
//   var scaledV = numeric.transpose(svd.V).map(function(x) {
//     return numeric.mul(numeric.sqrt(svd.S), x);
//   });
//   xs = numeric.dot(xs, numeric.transpose(scaledV));
//   return numeric.add(xs, mu);
// }

// function multivariateGaussianScore(params, x) {
//   var mu = params[0];
//   var cov = params[1];
//   var n = mu.length;
//   var coeffs = n * LOG_2PI + Math.log(numeric.det(cov));
//   var xSubMu = numeric.sub(x, mu);
//   var exponents = numeric.dot(numeric.dot(xSubMu, numeric.inv(cov)), xSubMu);
//   return -0.5 * (coeffs + exponents);
// }

// var multivariateGaussianERP = new ERP(multivariateGaussianSample, multivariateGaussianScore);

var discreteERP = new ERP(
    function discreteSample(params) {
      return multinomialSample(params[0]);
    },
    erpScorers.discreteScore,
    {
      support:
          function discreteSupport(params) {
            return _.range(params[0].length);
          }
    }
    );

function gammaSample(params) {
  var a = params[0];
  var b = params[1];
  if (a < 1) {
    return gammaSample([1 + a, b]) * Math.pow(Math.random(), 1 / a);
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
    u = Math.random();
    if ((u < 1 - 0.331 * x * x * x * x) || (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))) {
      return b * d * v;
    }
  }
}

// params are shape and scale
var gammaERP = new ERP(
    gammaSample,
    erpScorers.gammaScore
    );

var exponentialERP = new ERP(
    function exponentialSample(params) {
      var a = params[0];
      var u = Math.random();
      return Math.log(u) / (-1 * a);
    },
    erpScorers.exponentialScore
    );

function betaSample(params) {
  var a = params[0];
  var b = params[1];
  var x = gammaSample([a, 1]);
  return x / (x + gammaSample([b, 1]));
}

var betaERP = new ERP(
    betaSample,
    erpScorers.betaScore
    );

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
    u = Math.random();
    if (u < p) {
      (k++);
    }
  }
  return k || 0;
}

var binomialERP = new ERP(
    binomialSample,
    erpScorers.binomialScore,
    {
      support:
          function binomialSupport(params) {
            return _.range(params[1]).concat([params[1]]);
          }
    }
    );

var poissonERP = new ERP(
    function poissonSample(params) {
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
        p *= Math.random();
        (k++);
      } while (p > emu);
      return (k - 1) || 0;
    },
    erpScorers.poissonScore
    );

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

var dirichletERP = new ERP(dirichletSample, erpScorers.dirichletScore);

function multinomialSample(theta) {
  var thetaSum = util.sum(theta);
  var x = Math.random() * thetaSum;
  var k = theta.length;
  var probAccum = 0;
  for (var i = 0; i < k; i++) {
    probAccum += theta[i];
    if (probAccum >= x) {
      return i;
    } //FIXME: if x=0 returns i=0, but this isn't right if theta[0]==0...
  }
  return k;
}

// Make a discrete ERP from a {val: prob, etc.} object (unormalized).
function makeMarginalERP(marginal) {

  // Normalize distribution:
  var norm = 0;
  var supp = [];
  for (var v in marginal) {if (marginal.hasOwnProperty(v)) {
    var d = marginal[v];
    norm += d.prob;
    supp.push(d.val);
  }}
  var mapEst = {val: undefined, prob: 0};
  for (v in marginal) {if (marginal.hasOwnProperty(v)) {
    var dd = marginal[v];
    var nprob = dd.prob / norm;
    if (nprob > mapEst.prob)
      mapEst = {val: dd.val, prob: nprob};
    marginal[v].prob = nprob;
  }}

  // Make an ERP from marginal:
  var dist = new ERP(
      function(params) {
        var x = Math.random();
        var probAccum = 0;
        for (var i in marginal) {if (marginal.hasOwnProperty(i)) {
          probAccum += marginal[i].prob;
          // FIXME: if x=0 returns i=0, but this isn't right if theta[0]==0...
          if (probAccum >= x)
            return marginal[i].val;
        }}
        return marginal[i].val;
      },
      erpScorers.buildSimpleScorer(marginal),
      {
        support: function(params) {
          return supp;
        }
      }
      );

  dist.MAP = function() {return mapEst};
  return dist;
}

// Make an ERP that assigns probability 1 to a single value, probability 0 to everything else
var makeDeltaERP = function(v) {
  var dist = {};
  dist[JSON.stringify(v)] = {val: v, prob: 1}
  return new ERP(
      function deltaSample(params) {
        return v;
      },
      erpScorers.buildSimpleScorer(dist),
      {
        support: function deltaSupport(params) {
          return [v];
        }
      }
  );
};

var makeCategoricalERP = function(ps, vs) {
  var dist = {};
  vs.forEach(function(v, i) {dist[JSON.stringify(v)] = {val: v, prob: ps[i]}})
  return new ERP(
      function categoricalSample(params) {
        return vs[multinomialSample(ps)];
      },
      erpScorers.buildSimpleScorer(dist),
      {
        support: function categoricalSupport(params) {
          return vs
        }
      }
  );
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
  return new ERP(
      function multiplexSample(params) {
        var erp = selectERP(params);
        if (erp === undefined)
          throw 'multiplexSample: ERP undefined!'
        return erp.sample();
      },
      erpScorers.buildMultiplexScorer(selectERP),
      {
        support: function multiplexSupport(params) {
          var erp = selectERP(params);
          return erp.support();
        }
      }
  );
};

module.exports = {
  ERP: ERP,
  bernoulliERP: bernoulliERP,
  betaERP: betaERP,
  binomialERP: binomialERP,
  dirichletERP: dirichletERP,
  discreteERP: discreteERP,
  exponentialERP: exponentialERP,
  gammaERP: gammaERP,
  gaussianERP: gaussianERP,
  multinomialSample: multinomialSample,
  // multivariateGaussianERP: multivariateGaussianERP,
  poissonERP: poissonERP,
  randomIntegerERP: randomIntegerERP,
  uniformERP: uniformERP,
  makeMarginalERP: makeMarginalERP,
  makeDeltaERP: makeDeltaERP,
  makeCategoricalERP: makeCategoricalERP,
  makeMultiplexERP: makeMultiplexERP
};
