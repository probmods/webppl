'use strict';
'use ad';

var assert = require('assert');
var _ = require('lodash');
var guide = require('../../guide');
var ad = require('../../ad');
var util = require('../../util');

module.exports = function(env) {

  function dreamGradients(wpplFn, record, s, a, cont) {
    this.wpplFn = wpplFn;
    this.record = record;
    this.s = s;
    this.a = a;
    this.cont = cont;

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
      this.logp = this.logq = 0;

      return this.wpplFn(_.clone(this.s), function(s, val) {

        // We only backprop through logq, so we don't build ad graph
        // for logp. This is a sanity check for that.
        assert.ok(_.isNumber(this.logp), 'dream: Expected a number.');

        var objective = -this.logq;
        if (ad.isLifted(objective)) {
          objective.backprop();
        }

        var grads = _.mapValues(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads, this.logp - ad.value(this.logq));

      }.bind(this), this.a);

    },

    sample: function(s, k, a, dist, options) {
      options = options || {};
      // TODO: Is relativizing the address required here? Unlike with
      // SMC + EUBO I think the addresses will already line up.
      var rel = util.relativizeAddress(env, a);
      var val = this.record.trace.findChoice(
          this.record.trace.baseAddress + rel).val;
      assert.ok(val !== undefined, 'dream: No value for this choice in the trace.');

      if (this.insideMapData) {
        return guide.getDist(
          options.guide, options.noAutoGuide, dist, env, s, a,
          function(s, guideDist) {
            if (!guideDist) {
              throw new Error('dream: No guide distribution specified.');
            }
            this.logp += ad.value(dist.score(val));
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
      // observe. During the sampling phase we check that factor isn't
      // called, and given the trace this phase is a (deterministic)
      // replay of that.
      this.logp += ad.value(score);
      return k(s);
    },

    mapDataFetch: function() {
      if (this.insideMapData) {
        throw new Error('dream: nested mapData is not supported by this estimator.');
      }
      this.insideMapData = true;
      return {data: this.record.data, ix: null};
    },

    mapDataFinal: function() {
      this.insideMapData = false;
    }

  };

  return function() {
    var coroutine = Object.create(dreamGradients.prototype);
    dreamGradients.apply(coroutine, arguments);
    return coroutine.run();
  };

};
