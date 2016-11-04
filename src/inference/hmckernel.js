// Neal, Radford M. "MCMC using Hamiltonian dynamics." Handbook of
// Markov Chain Monte Carlo 2 (2011).
// http://arxiv.org/abs/1206.1901

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var dists = require('../dists');
var Trace = require('../trace');
var ad = require('../ad');
var Tensor = require('../tensor');
var generic = require('../math/genericArithmetic');

var addEq = generic.addEq;
var add = generic.add;
var mul = generic.mul;
var sum = generic.sum;

module.exports = function(env) {

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
    this.a = oldTrace.baseAddress; // Support relative addressing.

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  HMCKernel.prototype.sample = function(s, k, a, dist, options) {
    var prevChoice = this.prevTrace.findChoice(a);
    if (!prevChoice) {
      throw new Error('HMC does not support structural continuous variables.');
    }

    var val;
    if (dist.isContinuous) {
      if (dist.noHMC) {
        throw new Error('HMC does not yet support the ' + dist.meta.name + ' distribution');
      }

      var prevVal = ad.value(prevChoice.val);
      var _val = add(prevVal, mul(this.momentum[a], this.stepSize));

      // Handle constraints.

      // We only have constraints on scalar valued distributions at
      // present. The following is implemented using scalar math ops
      // for readability.
      if (dist.support) {
        var support = dist.support();
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
      val = ad.lift(_val);
    } else {
      val = prevChoice.val;
    }

    this.trace.addChoice(dist, val, a, s, k, options);
    return k(s, val);
  };

  HMCKernel.prototype.factor = function(s, k, a, score) {
    this.trace.numFactors += 1;
    this.trace.score = ad.scalar.add(this.trace.score, score);

    if (this.trace.numFactors === this.exitFactor) {
      this.trace.saveContinuation(s, k);
      return this.exit(s, undefined, true);
    }

    return k(s);
  };

  HMCKernel.prototype.run = function() {

    // Immediately return from coroutine if there are no continuous
    // random choices to propose to.
    var numChoices = this.oldTrace.choices.reduce(function(acc, c) {
      return acc + (c.dist.isContinuous ? 1 : 0);
    }, 0);
    if (numChoices === 0) {
      return this.continue(this.oldTrace);
    }

    // Zero derivatives left over from previous HMC iterations, or
    // from the rejuvenation of a particle which shares parts of the
    // ad graph with this trace.
    if (ad.isLifted(this.oldTrace.score)) {
      this.oldTrace.score.zeroDerivatives();
    }

    // Initialize momentum.
    this.momentum = sampleMomentum(this.oldTrace);

    // Compute current value of H.
    var oldH = computeH(this.oldTrace, this.momentum);

    this.momentumStep(this.oldTrace, 0.5); // Half-step. (Modifies momentum in-place.)

    // Main HMC loop.
    // The leapfrog method. (See page 8 of "MCMC using Hamiltonian
    // dynamics".)
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

  function stdGaussianSampleLike(x) {
    // Sample a value with same type (scalar/tensor) and dimension as
    // x from a standard Gaussian.
    return x instanceof Tensor ?
        dists.tensorGaussianSample(0, 1, x.dims) :
        dists.gaussianSample(0, 1);
  }

  function sampleMomentum(trace) {
    var momentum = {};
    _.each(trace.choices, function(choice) {
      if (choice.dist.isContinuous) {
        momentum[choice.address] = stdGaussianSampleLike(ad.value(choice.val));
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

    // Once the WebPPL program has finished we need to call cont to
    // continue inference. Since the program will call env.exit once
    // finished, we save cont here in order to resume inference as
    // desired. Note that we can't pass a continuation other than
    // env.exit to the program. This is because the continuation is
    // stored as part of the trace, and when invoked by a different
    // MCMC kernel execution would jump back here.
    this.positionStepCont = cont;

    env.query.clear();
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
    this.positionStepCont = undefined;
    return cont(this.trace);
  };

  HMCKernel.prototype.momentumStep = function(trace, scaleFactor) {
    if (ad.isLifted(trace.score)) {

      // Compute gradient of score w.r.t. the continuous variables.
      trace.score.backprop();

      var stepSize = this.stepSize * scaleFactor;
      _.each(trace.choices, function(choice) {
        if (choice.dist.isContinuous) {
          this.momentum[choice.address] = addEq(
              this.momentum[choice.address],
              mul(ad.derivative(choice.val), stepSize));
        }
      }, this);
    }
  };

  function computeH(trace, momentum) {
    var score = ad.value(trace.score);
    var kinetic = 0.5 * _.reduce(momentum, function(memo, p) {
      return memo + sum(mul(p, p));
    }, 0);
    var x = score - kinetic;
    return x;
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
    return this.continue(trace);
  };

  HMCKernel.prototype.continue = function(trace) {
    env.coroutine = this.coroutine;
    return this.cont(trace);
  };

  HMCKernel.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  return _.extendOwn(function(cont, oldTrace, options) {
    return new HMCKernel(cont, oldTrace, options).run();
  }, { adRequired: true });

};
