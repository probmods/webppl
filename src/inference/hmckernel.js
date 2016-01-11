// Neal, Radford M. "MCMC using Hamiltonian dynamics." Handbook of
// Markov Chain Monte Carlo 2 (2011).
// http://arxiv.org/abs/1206.1901

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var erp = require('../erp');
var Trace = require('../trace');
var ad = require('../ad');

module.exports = function(env) {

  var mvErpNames = ['multivariateGaussian', 'dirichlet', 'dirichletDrift'];

  function HMCKernel(cont, oldTrace, options) {
    var options = util.mergeDefaults(options, {
      steps: 5,
      stepSize: 0.1,
      exitFactor: 0
    });

    this.steps = options.steps;
    this.stepSize = options.stepSize;
    this.exitFactor = options.exitFactor;

    assert.ok(this.steps > 0);

    this.cont = cont;
    this.oldTrace = oldTrace;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  HMCKernel.prototype.sample = function(s, k, a, erp, params) {
    var prevChoice = this.prevTrace.findChoice(a);
    if (!prevChoice) {
      throw 'HMC does not support structural continuous variables.';
    }

    var val;
    if (erp.isContinuous) {
      var prevVal = ad.untapify(prevChoice.val);
      var _val = prevVal + this.stepSize * this.momentum[a];

      // Handle constraints.
      if (erp.support) {
        var support = erp.support(params);
        var lower = support.lower;
        var upper = support.upper;

        while (_val < lower || _val > upper) {
          if (_val < lower) {
            _val = lower + (lower - _val);
            this.momentum[a] *= -1;
          }
          if (_val > upper) {
            _val = upper - (_val - upper);
            this.momentum[a] *= -1;
          }
        }
      }
      val = ad.tapify(_val);
    } else {
      if (_.contains(mvErpNames, erp.name)) {
        throw 'Multivariate distributions are not yet supported by HMC.';
      }
      val = prevChoice.val;
    }

    this.trace.addChoice(erp, params, val, a, s, k);
    return k(s, val);
  };

  HMCKernel.prototype.factor = function(s, k, a, score) {
    this.trace.numFactors += 1;
    this.trace.score = ad.add(this.trace.score, score);

    if (this.trace.numFactors === this.exitFactor) {
      this.trace.saveContinuation(s, k);
      return this.exit(s, undefined, true);
    }

    return k(s);
  };

  HMCKernel.prototype.run = function() {
    // Initialize momentum.
    this.momentum = sampleMomentum(this.oldTrace);

    // Compute current value of H.
    var oldH = computeH(this.oldTrace, this.momentum);

    this.momentumStep(this.oldTrace, 0.5); // Half-step. (Modifies momentum in-place.)

    // Main HMC loop.
    // The leapfrog method. (See page 8 of "MCMC using Hamiltonian
    // dynamics.)
    return util.cpsIterate(
        this.steps - 1,
        this.oldTrace,
        this.leapFrogStep.bind(this),
        function(trace) {
          // Final position step:
          return this.positionStep(function(finalTrace) {

            // Final momentum half-step.
            this.momentumStep(finalTrace, 0.5);
            var newH = computeH(finalTrace, this.momentum);

            // Accept/reject.
            var p = Math.min(1, Math.exp(newH - oldH));
            var accept = util.random() < p;
            return this.finish(accept ? finalTrace : this.oldTrace, accept);

          }.bind(this), trace);
        }.bind(this));
  };

  function sampleMomentum(trace) {
    var momentum = {};
    _.each(trace.choices, function(choice) {
      if (choice.erp.isContinuous) {
        momentum[choice.address] = erp.gaussianERP.sample([0, 1]);
      }
    });
    return momentum;
  };

  HMCKernel.prototype.leapFrogStep = function(cont, trace) {
    return this.positionStep(function(newTrace) {
      this.momentumStep(newTrace, 1);
      return cont(newTrace);
    }.bind(this), trace);
  };

  HMCKernel.prototype.positionStep = function(cont, trace) {
    // Run the program creating a new trace with updated (continuous)
    // variables.
    this.prevTrace = trace;
    this.trace = this.prevTrace.fresh();
    // Once the WebPPL program has finished we need to call k to
    // continue inference. Since the program will call env.exit once
    // finished, we save k here in order to resume inference as
    // desired. Note that we can't pass a continuation other than
    // env.exit to the program. This is because the continuation is
    // store as part of the trace, and when invoked by a different
    // MCMC kernel execution would jump back here.
    this.positionStepCont = cont;
    return this.trace.continue();
  };

  HMCKernel.prototype.exit = function(k, val, earlyExit) {
    if (!earlyExit) {
      this.trace.complete(val);
    } else {
      assert(this.trace.store);
      assert(this.trace.k);
      assert(!this.trace.isComplete());
    }
    var cont = this.positionStepCont;
    this.thisPositionStepCont = undefined;
    return cont(this.trace);
  };

  HMCKernel.prototype.momentumStep = function(trace, scaleFactor) {
    // Compute gradient of score w.r.t. the continuous variables.
    ad.yGradientR(trace.score);
    var stepSize = this.stepSize * scaleFactor;
    _.each(trace.choices, function(choice) {
      if (choice.erp.isContinuous) {
        this.momentum[choice.address] += stepSize * choice.val.sensitivity;
      }
    }, this);
  };

  function computeH(trace, momentum) {
    var score = ad.untapify(trace.score);
    var kinetic = 0.5 * _.reduce(momentum, function(memo, p) { return memo + p * p; }, 0);
    return score - kinetic;
  }

  HMCKernel.prototype.finish = function(trace, accepted) {
    assert(_.isBoolean(accepted));
    if (accepted && trace.value === env.query) {
      trace.value = env.query.getTable();
    }
    if (this.oldTrace.info) {
      var oldInfo = this.oldTrace.info;
      trace.info = {
        accepted: oldInfo.accepted + accepted,
        total: oldInfo.total + 1
      };
    }
    env.coroutine = this.coroutine;
    return this.cont(trace);
  };

  HMCKernel.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return _.extendOwn(function(cont, oldTrace, options) {
    return new HMCKernel(cont, oldTrace, options).run();
  }, { adRequired: true });

};
