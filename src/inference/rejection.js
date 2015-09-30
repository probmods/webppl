// Rejection sampling
//
// maxScore: An upper bound on the total factor score per-execution.
//
// incremental: When true, improves efficiency by rejecting samples at factor
// statements where possible. Requires score <= 0 for all factors across all
// possible executions.

'use strict';

var erp = require('../erp');
var assert = require('assert');

module.exports = function(env) {

  function Rejection(s, k, a, wpplFn, numSamples, maxScore, incremental) {
    this.s = s;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.maxScore = maxScore === undefined ? 0 : maxScore
    this.incremental = incremental;
    this.hist = {};
    this.numSamples = numSamples;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    if (this.incremental) {
      assert(this.maxScore <= 0, 'maxScore cannot be positive for incremental rejection.');
    }
  }

  Rejection.prototype.run = function() {
    this.scoreSoFar = 0;
    this.threshold = this.maxScore + Math.log(util.random());
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  }

  Rejection.prototype.sample = function(s, k, a, erp, params) {
    return k(s, erp.sample(params));
  }

  Rejection.prototype.factor = function(s, k, a, score) {
    if (this.incremental) {
      assert(score <= 0, 'Score must be <= 0 for incremental rejection.');
    }
    this.scoreSoFar += score;
    // In incremental mode we can reject as soon as scoreSoFar falls below
    // threshold. (As all future scores are assumed to be <= 0 therefore
    // scoreSoFar can not increase.)
    if ((this.incremental && (this.scoreSoFar <= this.threshold)) ||
        (score === -Infinity)) {
      // Reject.
      return this.run();
    } else {
      return k(s);
    }
  }

  Rejection.prototype.exit = function(s, retval) {
    assert(this.scoreSoFar <= this.maxScore, 'Score exceeded upper bound.');

    if (this.scoreSoFar > this.threshold) {
      // Accept.
      var r = JSON.stringify(retval);
      if (this.hist[r] === undefined) {
        this.hist[r] = { prob: 0, val: retval };
      }
      this.hist[r].prob += 1;
      this.numSamples -= 1;
    }

    if (this.numSamples === 0) {
      var dist = erp.makeMarginalERP(util.logHist(this.hist));
      env.coroutine = this.oldCoroutine;
      return this.k(this.s, dist);
    } else {
      return this.run();
    }
  }

  Rejection.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function rej(s, k, a, wpplFn, numSamples, maxScore, incremental) {
    return new Rejection(s, k, a, wpplFn, numSamples, maxScore, incremental).run();
  }

  return {
    Rejection: rej
  };

};
