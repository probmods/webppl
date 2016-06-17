// Estimates the gradient of the EUBO.

// aka Tutorial training.

// Note that not all parameters are passed explicitly. Parameters are
// created lazily, and the guide program specifies how they should be
// initialized.

// Only the gradients of parameters seen during sampling are returned.
// All other gradients are taken to be zero.

// This is been developed as part of daipp. While it is expected to
// work it is unfinished and untested.

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var ad = require('../ad');
var paramStruct = require('../paramStruct');

module.exports = function(env) {

  function EUBO(wpplFn, s, a, options, params, step, cont) {
    this.opts = util.mergeDefaults(options, {
      miniBatchSize: 1
    });

    if (!_.has(this.opts, 'traces')) {
      throw 'Example traces required.';
    }

    this.traces = this.opts.traces;

    if (this.opts.miniBatchSize <= 0 ||
        this.opts.miniBatchSize > this.traces.length) {
      throw 'Invalid miniBatchSize.';
    }

    this.params = params;
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  EUBO.prototype = {

    run: function() {

      var eubo = 0;
      var grad = {};
      var traces = sampleMiniBatch(this.traces, this.opts.miniBatchSize);

      return util.cpsForEach(

        // Body.
        function(trace, i, traces, next) {
          return this.estimateGradient(trace, function(g, eubo_i) {
            paramStruct.addEq(grad, g); // Accumulate gradient estimates.
            eubo += eubo_i;
            return next();
          });
        }.bind(this),

        // Continuation.
        function() {
          paramStruct.divEq(grad, traces.length);
          eubo /= traces.length;
          env.coroutine = this.coroutine;
          return this.cont(grad, eubo);
        }.bind(this),

        traces);

    },

    // Compute a single sample estimate of the gradient.

    estimateGradient: function(trace, cont) {
      'use ad';

      // Make example trace available at sample statements.
      this.trace = trace;

      // paramsSeen tracks the AD nodes of all parameters seen during
      // a single execution. These are the parameters for which
      // gradients will be computed.
      this.paramsSeen = {};
      this.logq = 0;

      return this.wpplFn(_.clone(this.s), function() {

        var objective = -this.logq;
        objective.backprop();

        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads, -ad.value(objective));

      }.bind(this), this.a);

    },

    sample: function(s, k, a, dist, options) {
      'use ad';

      if (!_.has(options, 'guide')) {
        throw 'Guide not specified.';
      }

      var guideDist = options.guide;
      var rel = util.relativizeAddress(env, a);
      var guideVal = this.trace.findChoice(this.trace.baseAddress + rel).val;
      assert.notStrictEqual(guideVal, undefined);

      // We unlift guideVal to maintain the separation between the ad
      // graph we're building in order to optimize the parameters and
      // any ad graphs associated with the example traces. (The
      // choices in an example trace can be ad nodes when they are
      // generated with SMC + HMC rejuv.)
      var _guideVal = ad.value(guideVal);

      this.logq += guideDist.score(_guideVal);
      return k(s, _guideVal);
    },

    factor: function(s, k, a, score) {
      return k(s);
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: EUBO

  };

  function sampleMiniBatch(data, miniBatchSize) {
    if (data.length === miniBatchSize) {
      return data;
    } else {
      var miniBatch = [];
      _.times(miniBatchSize, function() {
        var ix = Math.floor(util.random() * data.length);
        miniBatch.push(data[ix]);
      });
      return miniBatch;
    }
  };

  return function() {
    var coroutine = Object.create(EUBO.prototype);
    EUBO.apply(coroutine, arguments);
    return coroutine.run();
  };

};
