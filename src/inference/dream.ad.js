// Merged "Stochastic" Dream
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

  function SDREAM(wpplFn, s, a, options, state, params, step, cont) {
    this.opts = util.mergeDefaults(options, {
      samples: 100,
      verbose: true,
    });

    if (this.opts.samples <= 0) {
      throw 'Invalid samples amount.';
    }

    // A point to the current record, containing a completed trace
    // and a list of observed values from a previous execution of wpplFn.
    this.currRecord = null;
    this.currObservationsObj = null;

    this.params = params;
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.isSamplingPass = true;

    // The global model includes anything outside of any mapData (level 0)
    // The local model includes anything inside of some mapData (level 1+)
    this.mapDataNestingLevel = 0;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  function checkScoreIsFinite(score, source) {
    var _score = ad.value(score);
    if (!isFinite(_score)) { // Also catches NaN.

      var msg = 'SDREAM: The score of the previous sample under the ' + source;
      msg += ' program was ' + _score + '.';
      if (_.isNaN(_score)) {
        msg += ' Reducing the step size may help.';
      }
      throw new Error(msg);
    }
  }

  SDREAM.prototype = {

    isInsideMapData: function() {
      return this.mapDataNestingLevel > 0;
    },

    // Run the program as per the number of samples we are required to collect.
    // As part of each such an execution sample, we create a record that contains
    // a completed trace and a list of observations. Then we compute a score based
    // on that.
    run: function() {
      var dream = 0;
      var grad = {};

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          // TODO: isolate the local functions
          function(i, next) {
            var samplingPass = function(i, cont) {
              this.isSamplingPass = true;
              // Records initialization.
              var trace = new Trace(this.wpplFn, this.s, this.k, this.a);
              // TODO: Remove array flag once we generalize for MapData params
              this.currRecord = {trace: trace, samplesScore: 0, observations: []};

              return this.wpplFn(_.clone(this.s), function(s, val) {
                // Record completion.
                this.currRecord.trace.complete(val);
                this.isSamplingPass = false;
                return cont();
              }.bind(this), this.a);
            }.bind(this); // TODO needed?

            var scoringPass = function() {
              return this.estimateGradient(this.currRecord, function(g, dream_i) {
                paramStruct.addEq(grad, g); // Accumulates gradient estimates.
                dream += dream_i;
                return next();
              }.bind(this));
            }.bind(this); // TODO needed?

            return samplingPass(i, scoringPass);
          }.bind(this), // TODO needed?

          // Continuation.
          function() {
            paramStruct.divEq(grad, this.opts.samples);
            dream /= this.opts.samples; // Averages estimations.
            env.coroutine = this.coroutine; // TODO needed?
            return this.cont(grad, dream);
          }.bind(this));
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

        debugger;
        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });
        debugger;

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
      var distribution = this.isInsideMapData() ?
          dist : (options && options.guide) || guide.independent(dist, a, env);

      if (this.isSamplingPass) {
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
      }
      else {
        var rel = util.relativizeAddress(env, a);
        var val = this.currRecord.trace.findChoice(
            this.currRecord.trace.baseAddress + rel).val;
        assert.notStrictEqual(val, undefined);
        if (this.isInsideMapData()) { // TODO: if we have distribution, then not really need that

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
      }

      return k(s, val);
    },

    // Updates the trace data structure according to the provided score
    factor: function(s, k, a, score) {
      // if (!isFinite(ad.value(score))) {
      //   throw new Error('SDREAM: factor score is not finite.');
      // }
      if (this.isSamplingPass) {
        assert.ok(!isNaN(ad.value(score)), 'factor() score was NaN');
        this.currRecord.trace.numFactors += 1;
        this.currRecord.trace.score += score;
      }
      return k(s);
    },

    // Instead of factoring the score of the observed given value,
    // in dream training we sample a hallucinated value instead and
    // push that to the corresponding record.
    observe: function(s, k, a, dist, val) {
      if (this.isSamplingPass) {
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
      }
      else {
        // TODO: eliminate duplication
        if (val !== undefined) {
          var factorK = function(s) {
            return k(s, val);
          };
          return env.factor(s, factorK, a, dist.score(val));
        } else {
          return env.sample(s, k, a, dist);
        }
      }
    },

    // TODO: Generalize for MapData objects
    mapDataEnter: function(val) {
      if (this.isSamplingPass) { // TODO: flag needed? not necessary...
        // Currently supports edge cases of no observations. Ultimately, we will keep this line
        // which assign the original observations object and then modify it in each
        // observe call to inject hallucinations.
        this.currObservationsObj = val;

        // Support for array type.
        // Currently assumes that in that case we have matching order of observe calls in obsFn.
        if (_.isArray(val)) {
          this.currObservationsObj = [];
        }
      }
    },

    mapDataLeave: function(val) {
      if (this.isSamplingPass) {
        // TODO: can push last obs obj in the Enter so that Leave won't be needed
        this.currRecord.observations.push(this.currObservationsObj);
      }
    },

    // Instead of returning the original data of observations, we inject
    // our hallucinated observations from the corresponding record.
    mapDataFetch: function(data, batchSize, address) {
      this.mapDataNestingLevel += 1;
      //assert(this.currRecord);
      return this.isSamplingPass ? data : this.currRecord.observations;
    },

    mapDataFinal: function(address) {
      this.mapDataNestingLevel -= 1;
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
