// Estimates the gradient of the ELBO.

// The estimator used is a combination of the
// likelihood-ratio/REINFORCE estimator and the "reparameterization
// trick" based estimator.

// Note that not all parameters are passed explicitly. Parameters are
// created lazily, and the guide program specifies how they should be
// initialized.

// Only the gradients of parameters seen during sampling are returned.
// All other gradients are taken to be zero.

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var ad = require('../ad');
var paramStruct = require('../paramStruct');
var guide = require('../guide');

module.exports = function(env) {

  function ELBO(wpplFn, s, a, options, state, params, step, cont) {
    this.opts = util.mergeDefaults(options, {
      samples: 1
    });

    // The current values of all initialized parameters.
    // (Scalars/tensors, not their AD nodes.)
    this.params = params;

    this.step = step;
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.mapDataState = {};

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  ELBO.prototype = {

    run: function() {

      var elbo = 0;
      var grad = {};

      return util.cpsLoop(
        this.opts.samples,

        // Loop body.
        function(i, next) {
          this.iter = i;
          return this.estimateGradient(function(g, elbo_i) {
            paramStruct.addEq(grad, g); // Accumulate gradient estimates.
            elbo += elbo_i;
            return next();
          });
        }.bind(this),

        // Loop continuation.
        function() {
          paramStruct.divEq(grad, this.opts.samples);
          elbo /= this.opts.samples;
          env.coroutine = this.coroutine;
          return this.cont(grad, elbo);
        }.bind(this));

    },

    // Compute a single sample estimate of the gradient.

    estimateGradient: function(cont) {
      'use ad';

      // paramsSeen tracks the AD nodes of all parameters seen during
      // a single execution. These are the parameters for which
      // gradients will be computed.
      this.paramsSeen = {};
      this.logp = this.logq = this.logr = 0;

      return this.wpplFn(_.clone(this.s), function() {

        var _logq = ad.value(this.logq);
        var _logp = ad.value(this.logp);
        checkScoreIsFinite(_logq, 'guide');
        checkScoreIsFinite(_logp, 'target');

        var scoreDiff = _logq - _logp;
        assert.ok(typeof scoreDiff === 'number');

        // Objective.

        // We could use the hybrid objective in all situations, but
        // for statistical efficiency we drop terms with zero
        // expectation where possible.

        var useLR = sameAdNode(this.logq, this.logr);

        // Sanity check.

        if (useLR) {
          // log p isn't expected to depend on the parameters unless
          // we use reparameterization.
          assert.ok(typeof this.logp === 'number');
        }

        // The objective used could change across steps, but for
        // simplicity only report on the first step.

        if (this.opts.verbose && this.iter === 0 && this.step === 0) {
          // Here PW stands for "path-wise" estimator, aka the reparam
          // trick.
          var estName =
                useLR ? 'LR' :
                (typeof this.logr === 'number') ? 'PW' :
                'hybrid';

          console.log('ELBO: Using ' + estName + ' estimator.');
        }

        var objective = useLR ?
              this.logq * scoreDiff :
              this.logr * scoreDiff + this.logq - this.logp;

        if (ad.isLifted(objective)) { // handle guides with zero parameters
          objective.backprop();
        }

        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads, -scoreDiff);

      }.bind(this), this.a);

    },

    sample: function(s, k, a, dist, options) {
      options = options || {};
      var guideDist;
      if (options.guide) {
        guideDist = options.guide;
      } else {
        guideDist = guide.independent(dist, a, env);
        if (this.step === 0 &&
            this.opts.verbose &&
            !this.mfWarningIssued) {
          this.mfWarningIssued = true;
          console.log('ELBO: Defaulting to mean-field for one or more choices.');
        }
      }
      var guideVal = this.sampleGuide(guideDist, options);
      this.sampleTarget(dist, guideVal);
      return k(s, guideVal);
    },

    sampleGuide: function(dist, options) {
      'use ad';

      var val;

      if ((!_.has(options, 'reparam') || options.reparam) &&
          dist.base && dist.transform) {
        // Use the reparameterization trick.

        var baseDist = dist.base();
        var z = baseDist.sample();
        this.logr += baseDist.score(z);
        val = dist.transform(z);
        this.logq += dist.score(val);

      } else if (options.reparam && !(dist.base && dist.transform)) {
        // Warn when reparameterization is explicitly requested but
        // isn't supported by the distribution.
        throw dist + ' does not support reparameterization.';
      } else {
        val = dist.sample();
        var score = dist.score(val);

        if (sameAdNode(this.logq, this.logr)) {
          // The reparameterization trick has not been used yet.
          // Continue representing logq and loqr with the same ad
          // node.
          this.logr += score;
          this.logq = this.logr;
        } else {
          // The reparameterization trick has been used earlier in the
          // execution. Update logq and logr independently.
          this.logr += score;
          this.logq += score;
        }
      }

      return val;
    },

    sampleTarget: function(dist, guideVal) {
      'use ad';
      this.logp += dist.score(guideVal);
    },

    factor: function(s, k, a, score) {
      'use ad';
      this.logp += score;
      return k(s);
    },

    mapDataFetch: function(data, batchSize, address) {

      var ix;
      if (batchSize === data.length) {
        // Use all the data, in order.
        ix = null;
      } else {
        ix = _.times(batchSize, function() {
          return Math.floor(util.random() * data.length);
        });
      }

      // Store the info needed to compute the correction to account
      // for the fact we only looked at a subset of the data.

      assert.ok(!this.mapDataState[address]);
      this.mapDataState[address] = {
        logp: this.logp,
        logq: this.logq,
        logr: this.logr,
        multiplier: batchSize > 0 ? (data.length / batchSize) - 1 : 0
      };

      return ix;
    },

    mapDataFinal: function(address) {
      'use ad';

      var state = this.mapDataState[address];
      assert.ok(state !== undefined);

      var noreparam = sameAdNode(this.logq, this.logr);
      var m = state.multiplier;

      this.logp += m * (this.logp - state.logp);
      this.logq += m * (this.logq - state.logq);
      if (noreparam) {
        // The reparameterization trick has not been used yet.
        // Continue representing logq and loqr with the same ad node.
        this.logr = this.logq;
      } else {
        this.logr += m * (this.logr - state.logr);
      }

      this.mapDataState[address] = undefined;
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: ELBO

  };

  function sameAdNode(a, b) {
    // We can't use === directly within an ad transformed function as
    // doing so checks the equality of the values stored at the nodes
    // rather than the nodes themselves.
    return a === b;
  }

  function checkScoreIsFinite(score, source) {
    if (!_.isFinite(score)) { // Also catches NaN.
      var msg = 'ELBO: The score of the previous sample under the ' +
            source + ' program was ' + score + '.';
      if (_.isNaN(score)) {
        msg += ' Reducing the step size may help.';
      }
      throw new Error(msg);
    }
  }

  return function() {
    var coroutine = Object.create(ELBO.prototype);
    ELBO.apply(coroutine, arguments);
    return coroutine.run();
  };

};
