'use strict';
var ad = require('../ad.js');
var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var Trace = require('../trace');
var guide = require('../guide');
module.exports = function(env) {
  function DreamSample(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      samples: 1,
      verbose: true,
      params: {}
    });
    if (ad.scalar.leq(this.opts.samples, 0)) {
      throw 'Invalid samples amount.';
    }
    this.params = this.opts.params;
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;
    this.insideMapData = true;
    this.records = [];
    this.currRecord;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }
  DreamSample.prototype = {
    run: function() {
      return util.cpsLoop(this.opts.samples, function(i, next) {
        var trace = new Trace(this.wpplFn, this.s, this.k, this.a);
        this.currRecord = {
          trace: trace,
          observations: []
        };
        return this.wpplFn(_.clone(this.s), function(s, val) {
          this.currRecord.trace.complete(val);
          this.records.push(this.currRecord);
          return next();
        }.bind(this), this.a);
      }.bind(this), function() {
        env.coroutine = this.coroutine;
        return this.k(this.s, this.records);
      }.bind(this));
    },
    sample: function(s, k, a, dist, options) {
      var distribution = this.insideMapData ? dist : options && options.guide || guide.independent(dist, a, env);
      var _val = distribution.sample();
      var val = this.ad && dist.isContinuous ? ad.lift(_val) : _val;
      this.currRecord.trace.addChoice(distribution, val, a, s, k, options);
      return k(s, val);
    },
    factor: function(s, k, a, score) {
      assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
      this.currRecord.trace.numFactors = ad.scalar.add(this.currRecord.trace.numFactors, 1);
      this.currRecord.trace.score = ad.scalar.add(this.currRecord.trace.score, score);
      return k(s);
    },
    mapDataFetch: function(data, batchSize, address) {
      this.insideMapData = true;
      return data;
    },
    mapDataFinal: function(address) {
      this.insideMapData = false;
    },
    observe: function(s, k, a, dist, val) {
      var _hallucinatedVal = dist.sample();
      var val = this.ad && dist.isContinuous ? ad.lift(_hallucinatedVal) : _hallucinatedVal;
      this.currRecord.trace.addChoice(distribution, val, a, s, k, options);
      this.currRecord.observations.push(val);
      return k(s, val);
    },
    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: DreamSample
  };
  return {
    DreamSample: function() {
      var coroutine = Object.create(DreamSample.prototype);
      DreamSample.apply(coroutine, arguments);
      return coroutine.run();
    }
  };
};
