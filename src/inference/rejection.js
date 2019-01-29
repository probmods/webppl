// Rejection sampling
//
// maxScore: An upper bound on the total factor score per-execution.
//
// incremental: When true, improves efficiency by rejecting samples at factor
// statements where possible. Requires score <= 0 for all factors across all
// possible executions.

'use strict';

var _ = require('lodash');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');
var cb = require('./callbacks');

module.exports = function(env) {

  function Rejection(s, k, a, wpplFn, options) {
    options = util.mergeDefaults(options, {
      samples: 100,
      maxScore: 0,
      incremental: false,
      throwOnError: true,
      minSampleRate: 0,
      callbacks: []
    }, 'Rejection');

    this.throwOnError = options.throwOnError;
    this.minSampleRate = options.minSampleRate;
    this.numSamplesTotal = options.samples;
    this.startTime = Date.now();

    this.numSamples = options.samples;
    this.maxScore = options.maxScore;
    this.incremental = options.incremental;
    this.callbacks = cb.prepare(options.callbacks);
    this.s = s;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.hist = new CountAggregator();
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    if (this.incremental && this.maxScore > 0) {
      util.warn('Rejection: Reduce maxScore to zero for better performance.');
    }
  }

  Rejection.prototype.run = function() {
    if (!_.isNumber(this.numSamples) || this.numSamples <= 0) {
      return this.error('"samples" should be a positive integer.');
    }
    var elapseSec = (Date.now() - this.startTime) / 1000.0;
    if (this.minSampleRate > 0 && elapseSec > 2) {
      // count the number of samples collected in ~2 secs
      // compute number of samples per sec
      var sampleRate = (this.numSamplesTotal - this.numSamples) / elapseSec;
      if (sampleRate < this.minSampleRate) {
        return this.error(sampleRate.toFixed(2) + ' samples/sec is below threshold.')
      }
      this.minSampleRate = 0;
    }
    this.scoreSoFar = 0;
    this.threshold = this.maxScore + Math.log(util.random());
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  // Error function for error handling
  // this.throwOnError is true: directly throw error
  // this.throwOnError is false: return error (string) as infer result
  Rejection.prototype.error = function(errType) {
    var err = new Error(errType);
    if (this.throwOnError) {
      throw err;
    } else {
      return this.k(this.s, err);
    }
  }

  Rejection.prototype.sample = function(s, k, a, dist) {
    return k(s, dist.sample());
  };

  Rejection.prototype.factor = function(s, k, a, score) {
    if (this.incremental) {
      if (score > 0) {
        return this.error('Score must be <= 0 for incremental rejection.');
      }
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
    if (this.scoreSoFar > this.maxScore) {
      return this.error('Score exceeded upper bound.')
    }

    if (this.scoreSoFar > this.threshold) {
      // Accept.
      this.hist.add(retval);
      this.callbacks.sample({value: retval});
      this.numSamples -= 1;
    }

    if (this.numSamples === 0) {
      env.coroutine = this.oldCoroutine;
      this.callbacks.finish();
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
