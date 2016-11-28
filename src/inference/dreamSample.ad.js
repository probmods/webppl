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

module.exports = function(env) {

  function DreamSample(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      samples: 100,
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

    // The global model includes anything outside of any mapData (level 0) 
    // The local model includes anything inside of some mapData (level 1+)
    this.mapDataNestingLevel = 0;

    this.isInsideMapData = function () {
      return this.mapDataNestingLevel > 0;
    }

    this.records = [];
    
    // TODO: Eliminate?
    this.currRecord = null;
    this.currObservation = null;

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
            // TODO: Remove array flag once we generalize for MapData params
            this.currRecord = {trace: trace, samplesScore: 0, observations: []};

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
      var distribution = this.isInsideMapData() ?
          dist : (options && options.guide) || guide.independent(dist, a, env);
      var val = distribution.sample();
      // var val = this.ad && dist.isContinuous ? ad.lift(_val) : _val;
      
      this.currRecord.trace.addChoice(distribution, val, a, s, k, options);

      // Accumulates score of samples inside mapData only, which can be 
      // used in the objective computation in dreamEUBO
      // TODO: check what should be the case for random global model
      // update trace score to take into account only local or use the sampleScore
      if (this.isInsideMapData()) {
        this.currRecord.samplesScore += distribution.score(val);
      }
      return k(s, val);
    },

    // Updates the trace data structure according to the provided score
    factor: function(s, k, a, score) {
      //if (!isFinite(ad.value(score))) {
      //   throw new Error('DREAM: factor score is not finite.');
      //}
      assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
      this.currRecord.trace.numFactors += 1;
      this.currRecord.trace.score += score;
      return k(s);
    },

    mapDataFetch: function(data, batchSize, address) {
      this.mapDataNestingLevel += 1;
      return data;
    },

    mapDataFinal: function(address) {
      this.mapDataNestingLevel -= 1;
    },

    // TODO: Generalize for MapData objects
    mapDataEnter: function (val) {
      // Currently supports edge cases of no observations. Ultimately, we will keep this line 
      // which assign the original observations object and then modify it in each 
      // observe call to inject hallucinations.
      this.currObservationsObj = val;
      
      // Support for array type. 
      // Currently assumes that in that case we have matching order of observe calls in obsFn.
      if(_.isArray(val)) {
        this.currObservationsObj = [];
      }
    },

    mapDataLeave: function (val) {
      this.currRecord.observations.push(this.currObservationsObj);
    },

    // Instead of factoring the score of the observed given value,
    // in dream training we sample a hallucinated value instead and
    // push that to the corresponding record.
    observe: function(s, k, a, dist, val) {
      var hallucinatedVal = dist.sample();
      //var val = this.ad && dist.isContinuous ?
      //     ad.lift(_hallucinatedVal) : _hallucinatedVal;
      this.currRecord.trace.addChoice(dist, hallucinatedVal, a, s, k);
      
      // TODO: construct new observations by injecting the hallucinated data rather than 
      // reconstruction of the mapData param since it doesn't generalize well.
      if (_.isArray(this.currObservationsObj)) {
        this.currObservationsObj.push(hallucinatedVal);
      }
      else {
        this.currObservationsObj = hallucinatedVal;
      }
      
      return k(s, hallucinatedVal);
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
