////////////////////////////////////////////////////////////////////
// HMC: Hamiltonian/Hybrid Monte Carlo
// TODO:
// - cycle kernels
// - mass term for momenta - currently 1.0

'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');

var ad = require('ad.js')({mode: 'r'})

module.exports = function(env) {

  function viewGradMom() {
    _.each(this.sites, function(entry, addr) {
      if (entry.type) {         // continuous erp
        console.log(entry.moment, entry.val.sensitivity);
      }
    });
  }

  function makeTraceEntry(s, k, a, erp, params, type, currScore, choiceScore, val) {
    return {store: s, k: k, addr: a, erp: erp, params: params, type: type,
      score: currScore, choiceScore: choiceScore, val: val};
  }

  function HMC(s, k, a, wpplFn, stepSize, steps, iterations) {
    this.stepSize = stepSize;
    this.steps = steps;
    this.step = steps;
    this.iterations = iterations;
    this.iteration = iterations;

    this.val = undefined;
    this.currScore = 0;
    this.sites = {};
    this.counterfactualUpdate = false;
    this.proposalRejected = undefined;

    this.leapfrogging = false;
    this.currentU = undefined;
    this.currentK = undefined;
    this.proposedU = undefined;
    this.proposedK = undefined;

    this.acceptedProps = 0;

    this.hist = {};
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    // Move old coroutine out of the way and install this as current handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  // Extract procedures that require AD-fication into prototypes
  // Should ideally be general coroutine methods instead of inference specific.
  HMC.prototype.liftedSampler = function(erp, params) {
    var val = erp.sample(ad.untapify(params));
    return (typeof val === 'number') ? ad.tapify(val) : val;
  }
  HMC.prototype.updateScore = function(score) {
    this.currScore = ad.add(this.currScore, score);
  }
  HMC.prototype.isScoreInf = function() {
    return ad.untapify(this.currScore) === -Infinity
  }

  // these machinations are required primarily because AD mutates
  // state behind your back; so if you want to undo the effect of
  // having previously run ad, then the cloning and saving,
  // particularly after having computed the gradient, is necessary in
  // to be able to reject proposals and recover.
  HMC.prototype.saveState = function() {
    this.oldval = this.val;
    this.oldScore = _.clone(this.currScore);
    this.oldSites = _.clone(this.sites);
  }
  HMC.prototype.restoreState = function() {
    this.val = this.oldval;
    this.currScore = _.clone(this.oldScore);
    this.sites = _.clone(this.oldSites);
  }

  HMC.prototype.run = function(counterfactualUpdate) {
    if (counterfactualUpdate)
      this.counterfactualUpdate = true;
    else {
      this.sites = {};
      this.counterfactualUpdate = false;
    }
    this.currScore = 0;
    return this.wpplFn(this.s, env.exit, this.a);
  };

  HMC.prototype.factor = function(s, k, a, score) {
    this.updateScore(score)
    return this.isScoreInf() ? this.exit(s) : k(s);
  };

  HMC.prototype.sample = function(s, k, a, erp, params) {
    var val;

    if (this.counterfactualUpdate) { // update old value instead of sampling
      var lk = this.sites[a];
      if (lk) {                  // continuous erp with gradient
        val = ad.tapify(lk.val.primal + (this.stepSize * lk.moment))
        console.log("moment: " + a, lk.moment);
      }
      else {
        // fixme: there needs to be some test here to make sure that
        // bad structure change does not happen when the erp is continuous
        // if discrete, no issues.
        val = this.liftedSampler(erp, params);
      }
    } else
      val = this.liftedSampler(erp, params);

    var choiceScore = erp.score(params, val);
    var newEntry = makeTraceEntry(_.clone(s), k, a, erp, params, erp.isContinuous(),
                                  this.currScore, choiceScore, val)

    // if counterfactual updating and at a continuous erp, keep momentum
    if (lk) newEntry.moment = lk.moment;

    this.sites[a] = newEntry;
    this.updateScore(choiceScore)
    if (this.isScoreInf())
      return this.exit(s);

    return k(s, val);
  };

  HMC.prototype.propose = function() {
    // if prev poposal was accepted, compute gradient and save state
    // before making new proposal
    if (!this.proposalRejected) {
      // compute gradients -- updates the trace-entries in `sites`
      ad.yGradientR(this.currScore)
      this.saveState();
    }

    // fixme: cycling proposals with mh
    return this.leapfrogInit()
  };

  HMC.prototype.leapfrogInit = function() {
    this.leapfrogging = true;

    this.currentU = this.currScore.primal;
    // fixme -- untapify didn't work here; why?

    var currentK = 0;
    var stepSize = this.stepSize;
    // sample momenta & update half step with gradient
    // p = p - (e/2 * (-dq))
    _.each(this.sites, function(entry, addr) {
      if (entry.type) {         // continuous erp
        var moment = erp.gaussianERP.sample([0.0, 1.0]);
        entry.moment = moment + (stepSize * entry.val.sensitivity / 2);
        currentK += Math.pow(moment, 2);
      }
    });
    this.currentK = currentK / 2;         // K(p) = \sum(p^2) / 2

    // set starting count
    this.step = this.steps - 1;

    // counterfactual update to get new state
    // q = q + e*p
    return this.run(true)
  }

  HMC.prototype.leapfrogStep = function(s, val) {
    this.step -= 1;
    if (this.step === 0)
      return this.leapfrogExit(s, val);

    // compute new gradient after counterfactual update
    ad.yGradientR(this.currScore);

    var stepSize = this.stepSize;
    // update momenta full step with gradient
    // p = p + e * (-dq)
    _.each(this.sites, function(entry, addr) {
      if (entry.type)         // continuous erp
        entry.moment += (stepSize * entry.val.sensitivity);
    });

    // counterfactual update to get new state
    // q = q + e*p
    return this.run(true)
  }

  HMC.prototype.leapfrogExit = function(s, val) {
    // compute new gradient after counterfactual update
    ad.yGradientR(this.currScore);

    this.proposedU = ad.untapify(this.currScore);
    var proposedK = 0;
    var stepSize = this.stepSize
    // update momenta half step with gradient
    // p = p + (e/2 * (-dq))
    _.each(this.sites, function(entry, addr) {
      if (entry.type) {         // continuous erp
        entry.moment += (stepSize * entry.val.sensitivity / 2);
        proposedK += Math.pow(entry.moment, 2);
      }
    });
    this.proposedK = proposedK / 2;
    // note: no negation

    this.leapfrogging = false;
    return this.exit(s, val)
  }

  HMC.prototype.exit = function(s, val) {
    // rejection initializer
    if (this.iteration === this.iterations && this.isScoreInf()) {
      return this.run();
    }

    // if leapfrogging, go no further until done
    if (this.leapfrogging)
      return this.leapfrogStep(s, val);

    console.log("Iteration - " + this.iteration);
    this.iteration -= 1;

    // compute acceptance prob
    var acceptance = Math.exp(this.proposedU - this.currentU +
                              this.currentK - this.proposedK);
    // console.log("acceptance = ", acceptance);
    // console.log("this.proposedU = ", this.proposedU);
    // console.log("this.currentU = ", this.currentU);
    // console.log("this.currentK = ", this.currentK);
    // console.log("this.proposedK = ", this.proposedK);

    this.val = val;
    this.proposalRejected = false;
    if (Math.random() >= acceptance) { // rejected: restore old state
      this.proposalRejected = true;
      this.restoreState();
    } else
      this.acceptedProps += 1;

    this.updateHist(this.val);

    return (this.iteration > 0) ?
        this.propose() :          // make a new proposal
        this.finish();            // finish up
  };

  HMC.prototype.updateHist = function(val) {
    var l = JSON.stringify(val.primal);
    if (this.hist[l] === undefined) this.hist[l] = {prob: 0, val: val.primal};
    this.hist[l].prob += 1;
  }

  HMC.prototype.finish = function(val) {
    var dist = erp.makeMarginalERP(this.hist);
    var k = this.k;
    console.log("AR:", this.acceptedProps / this.iterations);
    // Reinstate previous coroutine
    env.coroutine = this.oldCoroutine;
    // Return by calling original continuation
    return k(this.oldStore, dist);
  }

  function hmc(s, cc, a, wpplFn, stepSize, steps, iterations) {
    return new HMC(s, cc, a, wpplFn, stepSize, steps, iterations).run();
  }

  return {
    HMC: hmc
  };

};
