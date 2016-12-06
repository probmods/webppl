// Estimates the gradient of EUBO objective based on a list of records generated
// from dreamSample, each of them includes the trace and the observation values.

'use strict';
'use ad';

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
      throw 'Records of traces and observations are required.';
    }

    // A list of records, each contains a completed trace
    // and a list of observed values from a previous execution of wpplFn.
    // Records can be created by using dreamSample.
    this.records = this.opts.records;
    this.currRecord = null;

    this.params = params;
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    // The global model includes anything outside of any mapData (level 0) 
    // The local model includes anything inside of some mapData (level 1+)
    this.mapDataNestingLevel = 0;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  function checkScoreIsFinite(score, source) {
    var _score = ad.value(score);
    if (!isFinite(_score)) { // Also catches NaN.

      var msg = 'DREAM: The score of the previous sample under the ' + source;
      msg += ' program was ' + _score + '.';
      if (_.isNaN(_score)) {
        msg += ' Reducing the step size may help.';
      }
      throw new Error(msg);
    }
  }

  DREAM.prototype = {

    isInsideMapData: function () {
      return this.mapDataNestingLevel > 0;
    },

    // Computes the estimation of the objective EUBO by averaging the
    // gradients for all the records provided to the module through params,
    // so as to get an estimated expectation.
    run: function() {

      var dream = 0;
      var grad = {};

      return util.cpsForEach(

          // Body.
          function(record, i, records, next) {
            return this.estimateGradient(record, function(g, dream_i) {
              paramStruct.addEq(grad, g); // Accumulates gradient estimates.
              dream += dream_i;
              return next();
            });
          }.bind(this),

          // Continuation.
          function() {
            paramStruct.divEq(grad, this.records.length);
            dream /= this.records.length; // Averages estimations.
            env.coroutine = this.coroutine;
            return this.cont(grad, dream);
          }.bind(this),

          this.records);

    },

    // Computes a single sample estimate of the gradient,
    // which in case of EUBO is the minus guide scoring on
    // the target recorded samples.
    estimateGradient: function(record, cont) {

      // Makes record available throughout the module.
      this.currRecord = record;

      // paramsSeen tracks the AD nodes of all parameters seen during
      // a single execution. These are the parameters for which
      // gradients will be computed.
      this.paramsSeen = {};
      this.logq = 0;

      return this.wpplFn(_.clone(this.s), function() {

        var objective = -this.logq;

        if (ad.isLifted(objective)) { // Handles programs with zero random choices.
          objective.backprop();
        }

        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        var logp = ad.value(this.currRecord.trace.score);
        var logq = ad.value(this.logq);
        return cont(grads, logp - logq);
      }.bind(this), this.a);

    },

    // Since we already have all the records from a previous pass,
    // sample retrieves a previous sampled value from records for the
    // corresponding variable in the program that is asked to be sampled.
    // Inside mapData, it also accumulates the guide score into the objective.
    sample: function(s, k, a, dist, options) {
      // If guide distribution is not provided then we use mean field
      var guideDist = (options && options.guide) || guide.independent(dist, a, env);
      var rel = util.relativizeAddress(env, a);

      var val = this.currRecord.trace.findChoice(
          this.currRecord.trace.baseAddress + rel).val;
      assert.notStrictEqual(val, undefined);

      if (this.isInsideMapData()) {

        // We unlift guideVal to maintain the separation between the ad
        // graph we're building in order to optimize the parameters and
        // any ad graphs associated with the example traces. (The
        // choices in an example trace can be ad nodes when they are
        // generated with SMC + HMC rejuv.)
        var guideVal = ad.value(val);
        
        var guideScore = guideDist.score(guideVal);
        checkScoreIsFinite(guideScore, 'guide');

        this.logq += guideScore;
      }

      return k(s, val);
    },

    factor: function(s, k, a, score) {
      // if (!isFinite(ad.value(score))) {
      //   throw new Error('DREAM: factor score is not finite.');
      // }
      return k(s);
    },

    // Instead of returning the original data of observations, we inject
    // our hallucinated observations from the corresponding record.
    mapDataFetch: function(data, batchSize, address) {
      this.mapDataNestingLevel += 1;
      assert(this.currRecord);
      return this.currRecord.observations;
    },

    mapDataFinal: function(address) {
      this.mapDataNestingLevel -= 1;
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
