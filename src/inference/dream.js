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
  function SDREAM(wpplFn, s, a, options, state, params, step, cont) {
    this.opts = util.mergeDefaults(options, {
      samples: 100,
      verbose: true
    });
    if (ad.scalar.leq(this.opts.samples, 0)) {
      throw 'Invalid samples amount.';
    }
    this.currRecord = null;
    this.currObservationsObj = null;
    this.params = params;
    this.cont = cont;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;
    this.isSamplingPass = true;
    this.mapDataNestingLevel = 0;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }
  function checkScoreIsFinite(score, source) {
    var _score = ad.value(score);
    if (!isFinite(_score)) {
      var msg = ad.scalar.add('SDREAM: The score of the previous sample under the ', source);
      msg = ad.scalar.add(msg, ad.scalar.add(ad.scalar.add(' program was ', _score), '.'));
      if (_.isNaN(_score)) {
        msg = ad.scalar.add(msg, ' Reducing the step size may help.');
      }
      throw new Error(msg);
    }
  }
  SDREAM.prototype = {
    isInsideMapData: function() {
      debugger;
      return ad.scalar.gt(this.mapDataNestingLevel, 0);
    },
    run: function() {
      var dream = 0;
      var grad = {};
      debugger;
      return util.cpsLoop(this.opts.samples, function(i, next) {
        var samplingPass = function(i, cont) {
          debugger;
          this.isSamplingPass = true;
          var trace = new Trace(this.wpplFn, this.s, this.k, this.a);
          this.currRecord = {
            trace: trace,
            samplesScore: 0,
            observations: []
          };
          return this.wpplFn(_.clone(this.s), function(s, val) {
            debugger;
            this.currRecord.trace.complete(val);
            this.isSamplingPass = false;
            return cont();
          }.bind(this), this.a);
        }.bind(this);
        var scoringPass = function() {
          debugger;
          return this.estimateGradient(this.currRecord, function(g, dream_i) {
            debugger;
            paramStruct.addEq(grad, g);
            dream = ad.scalar.add(dream, dream_i);
            return next();
          }.bind(this));
        }.bind(this);
        return samplingPass(i, scoringPass);
      }.bind(this), function() {
        debugger;
        paramStruct.divEq(grad, this.opts.samples);
        dream = ad.scalar.div(dream, this.opts.samples);
        env.coroutine = this.coroutine;
        return this.cont(grad, dream);
      }.bind(this));
    },
    estimateGradient: function(record, cont) {
      debugger;
      this.currRecord = record;
      this.paramsSeen = {};
      this.logq = 0;
      return this.wpplFn(_.clone(this.s), function() {
        var objective = ad.scalar.neg(this.logq);
        if (ad.isLifted(objective)) {
          objective.backprop();
        }
        debugger;
        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });
        debugger;
        var logp = ad.value(this.currRecord.trace.score);
        var logq = ad.value(this.logq);
        return cont(grads, ad.scalar.sub(logp, logq));
      }.bind(this), this.a);
    },
    sample: function(s, k, a, dist, options) {
      debugger;
      var guideDist = options && options.guide || guide.independent(dist, a, env);
      var distribution = this.isInsideMapData() ? dist : options && options.guide || guide.independent(dist, a, env);
      if (this.isSamplingPass) {
        debugger;
        var val = distribution.sample();
        this.currRecord.trace.addChoice(distribution, val, a, s, k, options);
        if (this.isInsideMapData()) {
          this.currRecord.samplesScore = ad.scalar.add(this.currRecord.samplesScore, distribution.score(val));
        }
      } else {
        debugger;
        var rel = util.relativizeAddress(env, a);
        var val = this.currRecord.trace.findChoice(ad.scalar.add(this.currRecord.trace.baseAddress, rel)).val;
        assert.notStrictEqual(val, undefined);
        if (this.isInsideMapData()) {
          var guideVal = ad.value(val);
          var guideScore = guideDist.score(guideVal);
          checkScoreIsFinite(guideScore, 'guide');
          this.logq = ad.scalar.add(this.logq, guideScore);
        }
      }
      return k(s, val);
    },
    factor: function(s, k, a, score) {
      debugger;
      if (this.isSamplingPass) {
        debugger;
        assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
        this.currRecord.trace.numFactors = ad.scalar.add(this.currRecord.trace.numFactors, 1);
        this.currRecord.trace.score = ad.scalar.add(this.currRecord.trace.score, score);
      }
      return k(s);
    },
    observe: function(s, k, a, dist, val) {
      if (this.isSamplingPass) {
        debugger;
        var hallucinatedVal = dist.sample();
        this.currRecord.trace.addChoice(dist, hallucinatedVal, a, s, k);
        if (_.isArray(this.currObservationsObj)) {
          this.currObservationsObj.push(hallucinatedVal);
        } else {
          this.currObservationsObj = hallucinatedVal;
        }
        return k(s, hallucinatedVal);
      } else {
        debugger;
        if (ad.scalar.pneq(val, undefined)) {
          var factorK = function(s) {
            return k(s, val);
          };
          return env.factor(s, factorK, a, dist.score(val));
        } else {
          return env.sample(s, k, a, dist);
        }
      }
    },
    mapDataEnter: function(val) {
      debugger;
      if (this.isSamplingPass) {
        this.currObservationsObj = val;
        if (_.isArray(val)) {
          this.currObservationsObj = [];
        }
      }
    },
    mapDataLeave: function(val) {
      debugger;
      if (this.isSamplingPass) {
        this.currRecord.observations.push(this.currObservationsObj);
      }
    },
    mapDataFetch: function(data, batchSize, address) {
      debugger;
      this.mapDataNestingLevel = ad.scalar.add(this.mapDataNestingLevel, 1);
      return this.isSamplingPass ? data : this.currRecord.observations;
    },
    mapDataFinal: function(address) {
      debugger;
      this.mapDataNestingLevel = ad.scalar.sub(this.mapDataNestingLevel, 1);
    },
    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: SDREAM
  };
  return function() {
    var coroutine = Object.create(SDREAM.prototype);
    SDREAM.apply(coroutine, arguments);
    return coroutine.run();
  };
};
