// Coroutine to sample from the target (ignoring factor statements) or
// guide program.

'use strict';

var _ = require('underscore');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');
var ad = require('../ad');
var guide = require('../guide');

module.exports = function(env) {

  function ForwardSample(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      samples: 1,
      guide: false, // true = sample guide, false = sample target
      verbose: false,
      params: {}
    });

    this.params = this.opts.params;
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  ForwardSample.prototype = {

    run: function() {

      var hist = new CountAggregator();
      var logWeights = [];   // Save total factor weights

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          function(i, next) {
            this.logWeight = 0;
            return this.wpplFn(_.clone(this.s), function(s, val) {
              logWeights.push(this.logWeight);
              hist.add(val);
              return next();
            }.bind(this), this.a);
          }.bind(this),

          // Continuation.
          function() {
            env.coroutine = this.coroutine;
            var dist = hist.toDist();
            if (!this.opts.guide) {
              var numSamples = this.opts.samples;
              dist.normalizationConstant = util.logsumexp(logWeights) - Math.log(numSamples);
            }
            return this.k(this.s, dist);
          }.bind(this));

    },

    sample: function(s, k, a, dist, options) {
      if (this.opts.guide) {
        options = options || {};
        return guide.runIfThunkElseAuto(options.guide, dist, env, s, a, function(s, guideDist) {
          return k(s, guideDist.sample());
        });
      } else {
        return k(s, dist.sample());
      }
    },

    factor: function(s, k, a, score) {
      this.logWeight += ad.value(score);
      return k(s);
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: ForwardSample

  };

  return {
    ForwardSample: function() {
      var coroutine = Object.create(ForwardSample.prototype);
      ForwardSample.apply(coroutine, arguments);
      return coroutine.run();
    }
  };

};
