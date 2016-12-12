// Coroutine of the forward pass in dream training. Samples from the guide
// outside of mapData and from the target inside of mapData.
// Records the traces and observations.

'use strict';
'use ad';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');
var Trace = require('../trace');
var guide = require('../guide');

// TODO - should merge it back with forwardSample.js or keep it seperated?
// There are similarities in the general structure but ultimately also
// signficant differences and so maybe it would be better to keep these
// as two simlpe seperated modules rather than one merged..
module.exports = function(env) {

  function DreamSample(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      samples: 1,
      verbose: true,
      params: {}
    });

    if (this.opts.samples <= 0) {
      throw 'Invalid samples amount.';
    }

    this.params = this.opts.params;
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    // true when inside mapData (i.e. local model)
    // false otherwise (i.e. global model)
    this.insideMapData = true;

    this.records = [];
    this.currRecord;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  DreamSample.prototype = {

    // Run the program as per the number of samples we are required to collect.
    // As part of each such an execution sample, we create a record that contains
    // a completed trace and a list of observations.
    run: function() {

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          function(i, next) {

            // Records initialization.
            var trace = new Trace(this.wpplFn, this.s, this.k, this.a);
            this.currRecord = {trace: trace, observations: []};

            return this.wpplFn(_.clone(this.s), function(s, val) {

              // Record completion.
              this.currRecord.trace.complete(val);
              this.records.push(this.currRecord);
              return next();
            }.bind(this), this.a);
          }.bind(this),

          // Continuation.
          function() {
            env.coroutine = this.coroutine;
            return this.k(this.s, this.records);
          }.bind(this));

    },

    // Samples from the guide outside mapData and from the target inside mapData.
    // Add this choice to the recorded trace.
    sample: function(s, k, a, dist, options) {
      var distribution = this.insideMapData ?
          dist : (options && options.guide) || guide.independent(dist, a, env);
      var _val = distribution.sample();
      var val = this.ad && dist.isContinuous ? ad.lift(_val) : _val;
      this.currRecord.trace.addChoice(distribution, val, a, s, k, options);
      return k(s, val);
    },

    // Updates the trace data structure according to the provided score
    factor: function(s, k, a, score) {
      //if (!Number.isFinite(ad.value(score))) {
      //   throw new Error('DREAM: factor score is not finite.');
      //}
      assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
      this.currRecord.trace.numFactors += 1;
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

    // Instead of factoring the score of the observed given value,
    // in dream training we sample a hallucinated value instead and
    // push that to the corresponding record.
    observe: function(s, k, a, dist, val) {
      var _hallucinatedVal = dist.sample();
      var val = this.ad && dist.isContinuous ?
          ad.lift(_hallucinatedVal) : _hallucinatedVal;
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
