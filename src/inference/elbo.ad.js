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

  function ELBO(wpplFn, s, a, options, params, cont) {
    this.opts = util.mergeDefaults(options, {
      samples: 1
    });

    // The current values of all initialized parameters.
    // (Scalars/tensors, not their AD nodes.)
    this.params = params;

    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  ELBO.prototype = {

    run: function() {

      var grad = {};

      return util.cpsLoop(
        this.opts.samples,

        // Loop body.
        function(i, next) {
          return this.estimateGradient(function(g) {
            addEqG(grad, g); // Accumulate gradient estimates.
            return next();
          });
        },

        // Loop continuation.
        function() {
          divEqG(grad, this.opts.samples);
          env.coroutine = this.coroutine;
          return this.cont(grad);
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
        // gradient of log q is zero.

        var objective = this.logr * scoreDiff + this.logq - this.logp;
        objective.backprop();

        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads);

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
