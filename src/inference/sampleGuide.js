'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');
var ad = require('../ad');

module.exports = function(env) {

  function SampleGuide(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      samples: 1,
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

  SampleGuide.prototype = {

    run: function() {

      var hist = new CountAggregator();

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          function(i, next) {
            return this.wpplFn(_.clone(this.s), function(s, val) {
              hist.add(val);
              return next();
            }, this.a);
          },

          // Continuation.
          function() {
            env.coroutine = this.coroutine;
            return this.k(this.s, hist.toDist());
          },

          this
      );

    },

    sample: function(s, k, a, erp, options) {
      if (!(options && _.has(options, 'guide'))) {
        throw 'Guide not specified.';
      }
      var guideErp = options.guide;
      return k(s, guideErp.sample());
    },

    factor: function(s, k, a, score) {
      return k(s);
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: SampleGuide

  };

  return {
    SampleGuide: function() {
      var coroutine = Object.create(SampleGuide.prototype);
      SampleGuide.apply(coroutine, arguments);
      return coroutine.run();
    }
  };

};
