// Estimates the gradient of the EUBO.

// aka Tutorial training.

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

  function EUBO(wpplFn, s, a, options, params, cont) {
    this.opts = util.mergeDefaults(options, {
    });

    if (!_.has(this.opts, 'traces')) {
      throw 'Example traces required.';
    }

    this.params = params;
    this.traces = this.opts.traces;

    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  EUBO.prototype = {

    run: function() {

      var grad = {};

      return util.cpsForEach(

        // Body.
        function(trace, i, traces, next) {
          return this.estimateGradient(trace, function(g) {
            addEqG(grad, g); // Accumulate gradient estimates.
            return next();
          });
        }.bind(this),

        // Continuation.
        function() {
          divEqG(grad, this.traces.length);
          env.coroutine = this.coroutine;
          return this.cont(grad);
        }.bind(this),

        this.traces);

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

        var grad = _.mapObject(this.paramsSeen, function(param) {
          return ad.derivative(param);
        });

        return cont(grad);

      }.bind(this), this.a);

    },

    sample: function(s, k, a, erp, params, options) {
      'use ad';

      if (!_.has(options, 'guide')) {
        throw 'Guide not specified.';
      }

      var guideErp = options.guide[0];
      var guideParams = options.guide[1];
      var rel = this.relativeAddress(a);
      var guideVal = this.trace.findChoice(rel).val;
      assert.notStrictEqual(guideVal, undefined);
      this.logq += guideErp.score(guideParams, guideVal);
      return k(s, guideVal);
    },

    factor: function(s, k, a, score) {
      return k(s);
    },

    // This is identical to the implementation in ELBO.

    getParam: function(s, k, a, initFn) {
      var _val;
      var rel = this.relativeAddress(a);
      if (_.has(this.params, rel)) {
        _val = this.params[rel];
      } else {
        this.params[rel] = _val = initFn();
      }
      var val = ad.lift(_val);
      this.paramsSeen[rel] = val;
      return k(s, val);
    },

    relativeAddress: function(address) {
      assert.ok(address.startsWith(this.a));
      return address.slice(this.a.length);
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: EUBO

  };

  // Arithmetic on param/grad objects.

  function addEqG(g, h) {
    // In-place addition.

    // TODO: Update tensors in-place to minimize allocation.

    _.each(h, function(val, a) {
      if (!_.has(g, a)) {
        g[a] = generic.zerosLike(val);
      }
      g[a] = generic.add(g[a], val);
    });
  }

  function divEqG(g, s) {
    // In-place division by a scalar.
    _.each(g, function(val, a) {
      g[a] = generic.scalarDiv(val, s);
    });
  }

  return function() {
    var coroutine = Object.create(EUBO.prototype);
    EUBO.apply(coroutine, arguments);
    return coroutine.run();
  };

};
