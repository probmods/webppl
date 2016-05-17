// Rejection sampling
//
// maxScore: An upper bound on the total factor score per-execution.
//
// incremental: When true, improves efficiency by rejecting samples at factor
// statements where possible. Requires score <= 0 for all factors across all
// possible executions.

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');

module.exports = function(env) {

  function Rejection(s, k, a, wpplFn, options) {
    util.throwUnlessOpts(options, 'Rejection');
    options = util.mergeDefaults(options, {
      samples: 1,
      maxScore: 0,
      incremental: false
    });
    this.numSamples = options.samples;
    this.maxScore = options.maxScore;
    this.incremental = options.incremental;
    this.s = s;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.hist = new CountAggregator();
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    if (!_.isNumber(this.numSamples) || this.numSamples <= 0) {
      throw 'samples should be a positive integer.';
    }

    if (this.incremental) {
      assert(this.maxScore <= 0, 'maxScore cannot be positive for incremental rejection.');
    }
  }

  Rejection.prototype.run = function() {
    this.scoreSoFar = 0;
    this.threshold = this.maxScore + Math.log(util.random());
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  Rejection.prototype.sample = function(s, k, a, dist) {
    return k(s, dist.sample());
  };

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
  };

  Rejection.prototype.exit = function(s, retval) {
    assert(this.scoreSoFar <= this.maxScore, 'Score exceeded upper bound.');

    if (this.scoreSoFar > this.threshold) {
      // Accept.
      this.hist.add(retval);
      this.numSamples -= 1;
    }

    if (this.numSamples === 0) {
      env.coroutine = this.oldCoroutine;
      return this.k(this.s, this.hist.toDist());
    } else {
      return this.run();
    }
  };

  Rejection.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function rej(s, k, a, wpplFn, options) {
    return new Rejection(s, k, a, wpplFn, options).run();
  }

  return {
    Rejection: rej
  };

};
