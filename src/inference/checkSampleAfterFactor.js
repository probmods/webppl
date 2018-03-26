// Coroutine to check if there are interleaving samples and factors
// in the wppl script.
// Return: boolean. true for interleaving samples and factors,
// false for non-interleaving.

'use strict';

var _ = require('lodash');
var util = require('../util');
var ad = require('../ad');

module.exports = function(env) {

  function CheckSampleAfterFactor(s, k, a, wpplFn, options) {
    this.opts = {samples: 1};
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    // has seen at least one factor operation
    this.hasFactor = false;
    // at least one sample appears after factor
    this.hasSampleAfterFactor = false;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  CheckSampleAfterFactor.prototype = {

    run: function() {

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          function(i, next) {
            return this.wpplFn(_.clone(this.s), function(s, val) {
              return next();
            }, this.a);
          }.bind(this),

          // Continuation.
          function() {
            env.coroutine = this.oldCoroutine;
            return this.k(this.s, this.hasSampleAfterFactor);
          }.bind(this));

    },

    sample: function(s, k, a, dist, options) {
      if (this.hasFactor) {
        // has a sample after factor
        this.hasSampleAfterFactor = true;
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
    constructor: CheckSampleAfterFactor

  };

  return {
    CheckSampleAfterFactor: function() {
      var coroutine = Object.create(CheckSampleAfterFactor.prototype);
      CheckSampleAfterFactor.apply(coroutine, arguments);
      return coroutine.run();
    }
  };
};
