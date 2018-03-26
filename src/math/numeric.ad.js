'use strict';

var _ = require('lodash');
var ad = require('../ad');

var LOG_PI = 1.1447298858494002;
var LOG_2PI = 1.8378770664093453;

// By convention, non-adified versions of functions are prefixed with
// an underscore.

function sum(xs) {
  'use ad';
  return xs.reduce(function(a, b) { return a + b; }, 0);
}

function _sum(xs) {
  if (xs.length === 0) {
    return 0.0;
  } else {
    var total = _.reduce(xs,
        function(a, b) {
          return a + b;
        });
    return total;
  }
}

function product(xs) {
  'use ad';
  var result = 1;
  for (var i = 0, n = xs.length; i < n; i++) {
    result *= xs[i];
  }
  return result;
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

function squishToProbSimplex(x) {
  // Map a d dimensional vector onto the d simplex.
  var d = ad.value(x).dims[0];
  var u = ad.tensor.reshape(ad.tensor.concat(x, ad.tensor.fromScalars(0)), [d + 1, 1]);
  return ad.tensor.softmax(u);
}

function logaddexp(a, b) {
  'use ad';
  if (a === -Infinity) {
    return b;
  } else if (b === -Infinity) {
    return a;
  } else if (a > b) {
    return Math.log(1 + Math.exp(b - a)) + a;
  } else {
    return Math.log(1 + Math.exp(a - b)) + b;
  }
}

function _logsumexp(a) {
  var m = Math.max.apply(null, a);
  var sum = 0;
  for (var i = 0; i < a.length; ++i) {
    sum += (a[i] === -Infinity ? 0 : Math.exp(a[i] - m));
  }
  return m + Math.log(sum);
}

module.exports = {
  LOG_PI: LOG_PI,
  LOG_2PI: LOG_2PI,
  sum: sum,
  _sum: _sum,
  product: product,
  fact: fact,
  lnfact: lnfact,
  squishToProbSimplex: squishToProbSimplex,
  logaddexp: logaddexp,
  _logsumexp: _logsumexp
};
