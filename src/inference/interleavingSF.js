// Coroutine to sample from the target (ignoring factor statements) or
// guide program.

'use strict';

var _ = require('lodash');
var util = require('../util');
var ad = require('../ad');

module.exports = function(env) {

  function InterleavingSF(s, k, a, wpplFn, options) {
    this.opts = {samples: 1};
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;
    this.hasFactor = false;
    this.interleavingSampleFactor = false;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  InterleavingSF.prototype = {

    run: function() {

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          function(i, next) {
            this.logWeight = 0;
            return this.wpplFn(_.clone(this.s), function(s, val) {
              return next();
            }.bind(this), this.a);
          }.bind(this),

          // Continuation.
          function() {
            env.coroutine = this.coroutine;
            return this.k(this.s, this.interleavingSampleFactor);
          }.bind(this));

    },

    sample: function(s, k, a, dist, options) {
      if (this.hasFactor) {
        this.interleavingSampleFactor = true;
      }
      return k(s, dist.sample());
    },

    factor: function(s, k, a, score) {
      if (!this.hasFactor) {
        this.hasFactor = true;
      }
      return k(s);
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: InterleavingSF

  };

  return {
    InterleavingSF: function() {
      var coroutine = Object.create(InterleavingSF.prototype);
      InterleavingSF.apply(coroutine, arguments);
      return coroutine.run();
    }
  };
};
