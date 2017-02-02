// Coroutine to sample from the target (ignoring factor statements) or
// guide program.

'use strict';

var _ = require('lodash');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');
var ad = require('../ad');
var fs = require('fs');
var guide = require('../guide');

module.exports = function(env) {

  function ForwardSample(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      samples: 100,
      guide: false, // true = sample guide, false = sample target
      verbose: false,
      params: {},
      logDist: true,
      logDistFilename: 'forwardDist.csv'
    });

    // Setting the params to this field allows util.registerParams to access them (paramStore)
    //this.params = this.opts.params;
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;
    this.guideRequired = this.opts.guide;

    this.factorWarningIssued = false;

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
            if (this.opts.logDist) {
              fs.writeFileSync(this.opts.logDistFilename, dist.toCSV());
            }
            return this.k(this.s, dist);
          }.bind(this));

    },

    sample: function(s, k, a, dist, options) {
      if (this.opts.guide) {
        options = options || {};
        return guide.getDist(
            options.guide, options.noAutoGuide, dist, env, s, a,
            function(s, maybeGuideDist) {
              var d = maybeGuideDist || dist;
              return k(s, d.sample());
            });
      } else {
        return k(s, dist.sample());
      }
    },

    factor: function(s, k, a, score) {
      if (!this.opts.guide && !this.factorWarningIssued) {
        this.factorWarningIssued = true;
        var msg = 'Note that factor, condition and observe statements are ' +
            'ignored when forward sampling from a model.';
        util.warn(msg);
      }
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
