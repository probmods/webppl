'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var beta = require('./beta');

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

// see lemma 6.1 from Ahrens & Dieter's
// Computer Methods for Sampling from Gamma, Beta, Poisson and Binomial Distributions
function sample(p, n) {
  var k = 0;
  var N = 10;
  var a, b;
  while (n > N) {
    a = Math.floor(1 + n / 2);
    b = 1 + n - a;
    var x = beta.sample(a, b);
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

var Binomial = base.makeDistributionType({
  name: 'Binomial',
  desc: 'Distribution over the number of successes for ``n`` independent ``Bernoulli({p: p})`` trials.',
  params: [{name: 'p', desc: 'success probability', type: types.unitInterval},
           {name: 'n', desc: 'number of trials', type: types.positiveInt}],
  wikipedia: true,
  mixins: [base.finiteSupport],
  sample: function() {
    return sample(ad.value(this.params.p), this.params.n);
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

module.exports = {
  Binomial: Binomial,
  sample: sample
};
