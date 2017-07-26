// Coroutine to sample from the target (ignoring factor statements) or
// guide program.

'use strict';

var _ = require('lodash');
var util = require('../util');
var numeric = require('../math/numeric');
var CountAggregator = require('../aggregation/CountAggregator');
var ad = require('../ad');
var guide = require('../guide');

module.exports = function(env) {

  function RunForward(s, k, a, wpplFn, sampleGuide) {
    this.s = s;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.sampleGuide = sampleGuide;

    // Indicate that guide thunks should run.
    this.guideRequired = sampleGuide;
    this.isParamBase = true;

    this.score = 0;
    this.logWeight = 0;

    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  RunForward.prototype = {

    run: function() {
      return this.wpplFn(_.clone(this.s), function(s, val) {
        env.coroutine = this.oldCoroutine;
        var ret = {val: val, score: this.score, logWeight: this.logWeight};
        return this.k(this.s, ret);
      }.bind(this), this.a);
    },

    sample: function(s, k, a, dist, options) {
      var cont = function(s, dist) {
        var val = dist.sample();
        this.score += dist.score(val);
        return k(s, val);
      }.bind(this);

      if (this.sampleGuide) {
        options = options || {};
        return guide.getDist(
            options.guide, options.noAutoGuide, dist, env, s, a,
            function(s, maybeGuideDist) {
              return cont(s, maybeGuideDist || dist);
            });
      } else {
        return cont(s, dist);
      }
    },

    factor: function(s, k, a, score) {
      if (!this.sampleGuide) {
        var msg = 'Note that factor, condition and observe statements are ' +
            'ignored when forward sampling.';
        util.warn(msg, true);
      }
      this.logWeight += ad.value(score);
      return k(s);
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: RunForward

  };

  function runForward() {
    var coroutine = Object.create(RunForward.prototype);
    RunForward.apply(coroutine, arguments);
    return coroutine.run();
  }

  function ForwardSample(s, k, a, wpplFn, options) {
    var opts = util.mergeDefaults(options, {
      samples: 100,
      guide: false, // true = sample guide, false = sample target
      onlyMAP: false,
      verbose: false
    }, 'ForwardSample');

    var hist = new CountAggregator(opts.onlyMAP);
    var logWeights = [];   // Save total factor weights

    return util.cpsLoop(
        opts.samples,
        // Loop body.
        function(i, next) {
          return runForward(s, function(s, ret) {
            logWeights.push(ret.logWeight);
            hist.add(ret.val, ret.score);
            return next();
          }, a, wpplFn, opts.guide);
        },
        // Continuation.
        function() {
          var dist = hist.toDist();
          if (!opts.guide) {
            dist.normalizationConstant = numeric._logsumexp(logWeights) - Math.log(opts.samples);
          }
          return k(s, dist);
        }
    );
  }

  function extractVal(k) {
    return function(s, obj) {
      return k(s, obj.val);
    };
  }

  return {
    ForwardSample: ForwardSample,
    forward: function(s, k, a, model) {
      return runForward(s, extractVal(k), a, model, false);
    },
    forwardGuide: function(s, k, a, model) {
      return runForward(s, extractVal(k), a, model, true);
    }
  };

};
