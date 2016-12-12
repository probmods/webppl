'use strict';
var ad = require('../ad.js');
var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var ad = require('../ad');
var paramStruct = require('../paramStruct');
var Trace = require('../trace');
var guide = require('../guide');
module.exports = function(env) {
  function DREAM(wpplFn, s, a, options, state, params, step, cont) {
    this.opts = options;
    if (!_.has(this.opts, 'records')) {
      throw 'Records of traces and obsevations are required.';
    }
    this.records = this.opts.records;
    this.currRecord;
    this.params = params;
    this.cont = cont;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;
    this.insideMapData = false;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }
  function checkScoreIsFinite(score, source) {
    var _score = ad.value(score);
    if (!Number.isFinite(_score)) {
      var msg = ad.scalar.add(ad.scalar.add(ad.scalar.add(ad.scalar.add(
          'DREAM: The score of the previous sample under the ', source), ' program was '), _score), '.');
      if (_.isNaN(_score)) {
        msg = ad.scalar.add(msg, ' Reducing the step size may help.');
      }
      throw new Error(msg);
    }
  };
  DREAM.prototype = {
    run: function() {
      var dream = 0;
      var grad = {};
      return util.cpsForEach(function(record, i, records, next) {
        return this.estimateGradient(record, function(g, dream_i) {
          paramStruct.addEq(grad, g);
          dream = ad.scalar.add(dream, dream_i);
          return next();
        });
      }.bind(this), function() {
        paramStruct.divEq(grad, this.records.length);
        dream = ad.scalar.div(dream, this.records.length);
        env.coroutine = this.coroutine;
        return this.cont(grad, dream);
      }.bind(this), this.records);
    },
    estimateGradient: function(record, cont) {
      this.currRecord = record;
      this.paramsSeen = {};
      this.logq = 0;
      return this.wpplFn(_.clone(this.s), function() {
        var objective = ad.scalar.neg(this.logq);
        if (ad.isLifted(objective)) {
          objective.backprop();
        }
        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });
        return cont(grads, ad.scalar.neg(ad.value(objective)));
      }.bind(this), this.a);
    },
    sample: function(s, k, a, dist, options) {
      var guideDist = options && options.guide || guide.independent(dist, a, env);
      var rel = util.relativizeAddress(env, a);
      var val = this.currRecord.trace.findChoice(ad.scalar.add(this.currRecord.trace.baseAddress, rel)).val;
      assert.notStrictEqual(val, undefined);
      if (this.insideMapData) {
        var _guideVal = guideDist.score(val);
        checkScoreIsFinite(_guideVal, 'guide');
        this.logq = ad.scalar.add(this.logq, _guideVal);
      }
      return k(s, val);
    },
    factor: function(s, k, a, score) {
      return k(s);
    },
    mapDataFetch: function(data, batchSize, address) {
      this.insideMapData = true;
      assert(this.currRecord);
      return currRecord.observations;
    },
    mapDataFinal: function(address) {
      this.insideMapData = false;
    },
    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: DREAM
  };
  return function() {
    var coroutine = Object.create(DREAM.prototype);
    DREAM.apply(coroutine, arguments);
    return coroutine.run();
  };
};
