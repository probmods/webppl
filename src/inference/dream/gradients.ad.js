'use strict';
'use ad';

var assert = require('assert');
var _ = require('lodash');
var guide = require('../../guide');
var ad = require('../../ad');

module.exports = function(env) {

  function dreamGradients(wpplFn, record, s, a, cont) {
    this.wpplFn = wpplFn;
    this.record = record;
    this.s = s;
    this.a = a;
    this.cont = cont;

    this.guideRequired = true;
    this.isParamBase = true;

    this.insideMapData = false;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  dreamGradients.prototype = {

    run: function() {
      return this.estimateGradient(function(grad, objVal) {
        env.coroutine = this.coroutine;
        return this.cont(grad, objVal);
      }.bind(this));
    },

    estimateGradient: function(cont) {

      this.paramsSeen = {};
      this.logq = 0;

      return this.wpplFn(_.clone(this.s), function(s, val) {

        var objective = -this.logq;
        if (ad.isLifted(objective)) {
          objective.backprop();
        }

        var grads = _.mapValues(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads, -ad.value(this.logq));

      }.bind(this), this.a);

    },

    sample: function(s, k, a, dist, options) {
      options = options || {};
      var choice = this.record.trace.findChoice(a);
      assert.ok(choice !== undefined, 'dream: No entry for this choice in the trace.');
      var val = choice.val;

      if (this.insideMapData) {
        return guide.getDist(
            options.guide, options.noAutoGuide, dist, env, s, a,
            function(s, guideDist) {
              if (!guideDist) {
                throw new Error('dream: No guide distribution specified.');
              }
              this.logq += guideDist.score(val);
              return k(s, val);
            }.bind(this));
      }
      else {
        return k(s, val);
      }
    },

    factor: function(s, k, a, score) {
      // This will only be called by the default implementation of
      // observe. (Because we checked that factor isn't called during
      // the sampling phase, and since we're reusing choices from the
      // trace, the execution here will follow the same path through
      // the program.)
      return k(s);
    },

    mapDataFetch: function(data, opts, a) {
      if (this.insideMapData) {
        throw new Error('dream: nested mapData is not supported by this estimator.');
      }
      this.insideMapData = true;
      return {data: this.record.data, ix: null, address: a + '_dream'};
    },

    mapDataFinal: function() {
      this.insideMapData = false;
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: dreamGradients

  };

  return function() {
    var coroutine = Object.create(dreamGradients.prototype);
    dreamGradients.apply(coroutine, arguments);
    return coroutine.run();
  };

};
