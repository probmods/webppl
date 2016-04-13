// Estimates the gradient of the ELBO.

// The estimator used is a combination of the
// likelihood-ratio/REINFORCE estimator and the "reparameterized
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
var generic = require('../generic');
var ad = require('../ad');
var Tensor = require('../tensor');

module.exports = function(env) {

  var headerUtils = require('../headerUtils')(env);

  function ELBO(wpplFn, s, a, options, params, step, cont) {
    this.opts = util.mergeDefaults(options, {
      samples: 1,
      persistentBatches: false
    });

    // The current values of all initialized parameters.
    // (Scalars/tensors, not their AD nodes.)
    this.params = params;

    this.step = step;
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

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
            addEqG(grad, g); // Accumulate gradient estimates.
            elbo += elbo_i;
            return next();
          });
        },

        // Loop continuation.
        function() {
          divEqG(grad, this.opts.samples);
          elbo /= this.opts.samples;
          env.coroutine = this.coroutine;
          return this.cont(grad, elbo);
        },

        this);

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

        var scoreDiff = ad.value(this.logq) - ad.value(this.logp);
        assert.ok(typeof scoreDiff === 'number');

        // TODO: Without reparameterization, the expectation of the
        // gradient of log q is zero. Optimize by removing this term
        // when not using reparm trick. Can we test for this with
        // `logq !== logr`?

        var objective = this.logr * scoreDiff + this.logq - this.logp;
        objective.backprop();

        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads, -scoreDiff);

      }.bind(this), this.a);

    },

    sample: function(s, k, a, erp, params, options) {
      options = options || {};

      // TODO: Default to mean-field?
      if (!_.has(options, 'guide')) {
        throw 'Guide not specified.';
      }

      var guideVal = this.sampleGuide.apply(this, options.guide.concat(options));
      this.sampleTarget(erp, params, guideVal);
      return k(s, guideVal);
    },

    sampleGuide: function(erp, params, options) {
      'use ad';

      // At present, samplers expect untapified params.
      var _params = params.map(ad.value);
      var val;

      if ((!_.has(options, 'reparam') || options.reparam) &&
          erp.baseParams && erp.transform) {
        // Use the reparameterization trick.

        var baseERP = erp.baseERP || erp;
        var baseParams = erp.baseParams(_params);
        var z = baseERP.sample(baseParams);

        this.logr += baseERP.score(baseParams, z);
        val = erp.transform(z, params);

        // console.log('Sampled ' + ad.value(val));
        // console.log('  ' + erp.name + '(' + _params + ') reparameterized as ' +
        //             baseERP.name + '(' + baseParams + ') + transform');

      } else if (options.reparam && !(erp.baseParams && erp.transform)) {
        // Warn when reparameterization is explicitly requested but
        // isn't supported by the ERP.
        throw erp.name + ' ERP does not support reparameterization.';
      } else {
        val = erp.sample(_params);
        this.logr += erp.score(params, val);
        // trace('Sampled ' + val + ' for ' + a);
        // trace('  ' + erp.name + '(' + _params + ')');
      }

      this.logq += erp.score(params, val);
      return val;
    },

    sampleTarget: function(erp, params, guideVal) {
      'use ad';
      this.logp += erp.score(params, guideVal);
    },

    factor: function(s, k, a, score) {
      'use ad';
      this.logp += score;
      return k(s);
    },

    mapDataFetch: function(ixprev, data, options, address) {

      // `ixprev` is an array of the indices used by the last
      // invocation of this mapData. This will be undefined the on the
      // first call to a particular mapData. The empty array stands
      // for all indices.

      assert.strictEqual(this.mapDataMultiplier, undefined);
      assert.strictEqual(this.logp0, undefined);
      assert.strictEqual(this.logq0, undefined);
      assert.strictEqual(this.logr0, undefined);

      // If `persistentBatches` is enabled then we only draw a fresh
      // mini-batch on the first execution (sample) of the first step
      // of `Optimize`. This is the behavior Noah described for an
      // 'epoch' of wakey/sleepy.

      var drawMiniBatch = options.batchSize < data.length &&
            !this.opts.persistentBatches || (this.step === 0 && this.iter === 0);

      // Choose data uniformly at random if drawing a fresh
      // mini-batch. Otherwise, use the previous mini-batch.
      var ix = drawMiniBatch ?
            _.times(options.batchSize, function() {
              return Math.floor(util.random() * data.length);
            }) : ixprev;

      // Store the info needed to compute the correction to account
      // for the fact we only looked as a subset of the data.

      // This assumes we don't have nested calls to `mapData`. Once we
      // do we can use `address` (the relative address of the mapData
      // call) for book-keeping?

      this.mapDataMultiplier = data.length / options.batchSize;
      this.logp0 = this.logp;
      this.logq0 = this.logq;
      this.logr0 = this.logr;

      return ix;
    },

    mapDataFinal: function() {
      'use ad';
      assert.ok(this.mapDataMultiplier);
      assert.ok(this.logp0);
      assert.ok(this.logq0);
      assert.ok(this.logr0);
      var m = this.mapDataMultiplier - 1;
      this.logp += m * (this.logp - this.logp0);
      this.logq += m * (this.logq - this.logq0);
      this.logr += m * (this.logr - this.logr0);
      this.mapDataMultiplier = this.logp0 = this.logq0 = this.logr0 = undefined;
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: ELBO

  };

  // TODO: Duplicated in eubo.ad.js, so extract. Could also include
  // the logic required to (deep)clone a params object.

  // Arithmetic on param/grad objects.

  function addEqG(g, h) {
    // In-place addition.

    // TODO: Update tensors in-place to minimize allocation.

    _.each(h, function(hs, a) {
      if (!_.has(g, a)) {
        g[a] = hs;
      } else {
        var gs = g[a];
        assert.strictEqual(gs.length, hs.length);
        for (var i = 0; i < gs.length; i++) {
          gs[i] = generic.add(gs[i], hs[i]);
        }
      }
    });
  }

  function divEqG(g, s) {
    // In-place division by a scalar.
    _.each(g, function(gs) {
      for (var i = 0; i < gs.length; i++) {
        gs[i] = generic.scalarDiv(gs[i], s);
      }
    });
  }

  return function() {
    var coroutine = Object.create(ELBO.prototype);
    ELBO.apply(coroutine, arguments);
    return coroutine.run();
  };

};
