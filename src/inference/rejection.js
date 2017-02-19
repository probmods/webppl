// Rejection sampling
//
// maxScore: An upper bound on the total factor score per-execution.
//
// incremental: When true, improves efficiency by rejecting samples at factor
// statements where possible. Requires score <= 0 for all factors across all
// possible executions.

'use strict';

var _ = require('lodash');
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
    this.probe = options.probe;
    this.numSamplesBak = options.samples;
    this.startTime = Date.now();

    this.hasFactor = false;
    this.interleavingSampleFactor = false;

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
      throw new Error('samples should be a positive integer.');
    }

    if (this.incremental && this.maxScore > 0) {
      util.warn('Rejection: Reduce maxScore to zero for better performance.');
    }
  }

  Rejection.prototype.run = function() {
    var elapseSec = (Date.now() - this.startTime) / 1000.0;
    if (elapseSec > 2) {
      // console.log('.....')
      var numFound = this.numSamplesBak - this.numSamples;
      if (numFound < this.probe) {
        console.log('only getting ' + numFound + ' samples in 2 seconds...quit Rejection')
        return this.k(this.s, this.interleavingSampleFactor);
      }
    }
    this.scoreSoFar = 0;
    this.threshold = this.maxScore + Math.log(util.random());
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  Rejection.prototype.sample = function(s, k, a, dist) {
    if (this.hasFactor) {
      this.interleavingSampleFactor = true;
    }
    return k(s, dist.sample());
  };

  Rejection.prototype.factor = function(s, k, a, score) {
    if (!this.hasFactor) {
      this.hasFactor = true;
    }
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
      this.hasFactor = false;
      return this.run();
    } else {
      return k(s);
    }
  };

  Rejection.prototype.exit = function(s, retval) {
    try {
      assert(this.scoreSoFar <= this.maxScore, 'Score exceeded upper bound.');
    } catch(err) {
      if (this.probe) {
        return this.k(this.s, this.interleavingSampleFactor);
      } else {
        throw err;
      }
    }

    if (this.scoreSoFar > this.threshold) {
      // Accept.
      this.hist.add(retval);
      this.numSamples -= 1;
    }

    if (this.numSamples === 0) {
      env.coroutine = this.oldCoroutine;
      return this.k(this.s, this.hist.toDist());
    } else {
      this.hasFactor = false;
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
