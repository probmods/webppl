'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Histogram = require('../aggregation/histogram');
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

    this.hist = new Histogram();

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  SampleGuide.prototype = {

    run: function() {
      return this.wpplFn(_.clone(this.s), env.exit, this.a);
    },

    sample: function(s, k, a, erp, params, options) {
      if (!(options && _.has(options, 'guide'))) {
        throw 'Guide not specified.';
      }
      var guideErp = options.guide[0];
      var guideParams = options.guide[1];
      var _guideParams = guideParams ? guideParams.map(ad.value) : [];
      return k(s, guideErp.sample(_guideParams));
    },

    factor: function(s, k, a, score) {
      return k(s);
    },

    exit: function(s, retval) {
      this.hist.add(retval);
      this.opts.samples -= 1;
      if (this.opts.samples === 0) {
        env.coroutine = this.coroutine;
        return this.k(this.s, this.hist.toERP());
      } else {
        return this.run();
      }
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
