'use strict';

function MAP() {
  if (this.support === undefined)
    throw 'Cannot compute entropy for ERP without support!'
  var supp = this.support([]);
  var mapEst = {val: undefined, prob: 0};
  for (var i = 0, l = supp.length; i < l; i++) {
    var sp = supp[i];
    var sc = Math.exp(this.score([], sp))
    if (sc > mapEst.prob) mapEst = {val: sp, prob: sc};
  }
  this.MAP = function() {return mapEst};
  return mapEst;
}

function entropy() {
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
}

var LOG_2PI = 1.8378770664093453;

function uniformScore(params, val) {
  if (val < params[0] || val > params[1]) {
    return -Infinity;
  }
  return -Math.log(params[1] - params[0]);
}

// note: if you flip based on some erpScore, if that erp is a density,
// weight can be greater than 1.0
function flipScore(params, val) {
  if (val !== true && val !== false) return -Infinity;
  var weight = params[0];
  return (val ?
          (weight > 1.0 ? 0.0 : Math.log(weight)) :
          (weight > 1.0 ? -Infinity : Math.log(1 - weight)));
}

function randomIntegerScore(params, val) {
  var stop = params[0];
  var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < stop);
  return inSupport ? -Math.log(stop) : -Infinity;
}

function gaussianScore(params, x) {
  var mu = params[0];
  var sigma = params[1];
  return -0.5 * (LOG_2PI + 2 * Math.log(sigma) + (x - mu) * (x - mu) / (sigma * sigma));
}

function discreteScore(params, val) {
  var probs = params[0];
  var stop = probs.length;
  var inSupport = (val === Math.floor(val)) && (0 <= val) && (val < stop);
  var sum = 0; while (stop--) sum += probs[stop];
  return inSupport ? Math.log(probs[val] / sum) : -Infinity;
}

var gammaCof = [76.18009172947146,
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
    (x++);
    ser += gammaCof[j] / x;
  }
  return -tmp + Math.log(2.5066282746310005 * ser);
}

function gammaScore(params, val) {
  var a = params[0];
  var b = params[1];
  var x = val;
  return (a - 1) * Math.log(x) - x / b - logGamma(a) - a * Math.log(b);
}

function exponentialScore(params, val) {
  var a = params[0];
  return Math.log(a) - a * val;
}

function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function betaScore(params, val) {
  var a = params[0];
  var b = params[1];
  var x = val;
  return ((x > 0 && x < 1) ?
          (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(a, b) :
          -Infinity);
}

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

function binomialScore(params, val) {
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
}


function fact(x) {
  var t = 1;
  while (x > 1) {
    t *= x;
    (x--);
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

function poissonScore(params, val) {
  var mu = params[0];
  var k = val;
  return k * Math.log(mu) - mu - lnfact(k);
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

function buildSimpleScorer(dist) {
  return function(params, val) {
    var lk = dist[JSON.stringify(ad.untapify(val))];
    return lk ? Math.log(lk.prob) : -Infinity;
  }
}

function buildMultiplexScorer(selector) {
  return function(params, value) {
    var erp = selector(params);
    return (erp === undefined) ? -Infinity : erp.score([], value);
  }
}

module.exports = {
  MAP: MAP,
  entropy: entropy,
  uniformScore: uniformScore,
  flipScore: flipScore,
  randomIntegerScore: randomIntegerScore,
  gaussianScore: gaussianScore,
  discreteScore: discreteScore,
  gammaScore: gammaScore,
  exponentialScore: exponentialScore,
  betaScore: betaScore,
  binomialScore: binomialScore,
  poissonScore: poissonScore,
  dirichletScore: dirichletScore,
  buildSimpleScorer: buildSimpleScorer,
  buildMultiplexScorer: buildMultiplexScorer
}
