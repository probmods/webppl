////////////////////////////////////////////////////////////////////
// HMC: Hamiltonian/Hybrid Monte Carlo
// TODO:
// - early exit leapfrog if score becomes -Infinity
// - cycle kernels
// - mass term for momenta - currently 1.0

'use strict';

var _ = require('underscore');
var erp = require('../erp.js');
var ad = require('ad.js')({mode: 'r'})

var T = require('../trace');
var makeTrace = T.makeTrace
var makeProposal = T.makeProposal

module.exports = function(env) {

  function getOpt(value, defaultValue) { return value === undefined ? defaultValue : value; };

  function HMC(s, k, a, wpplFn, opts) {
    this.stepSize          = getOpt(opts.stepSize, 0.1);
    this.step              = getOpt(opts.steps, 10);
    this.steps             = getOpt(opts.steps, 10);
    this.iteration         = getOpt(opts.iterations, 100);
    this.iterations        = getOpt(opts.iterations, 100);
    this.proposers         = getOpt(opts.proposers, ['leapfrog']);
    this.verbosity         = getOpt(opts.verbosity, 0);

    this.proposerIndex     = 0;
    this.acceptedProposals = 0;
    this.trace             = undefined;
    this.oldTrace          = undefined;
    this.proposals         = {};
    this.oldProposals      = undefined;
    this.oldValue          = undefined;
    this.oldExit           = undefined;

    this.hist              = {};
    this.wpplFn            = wpplFn;
    this.s                 = s;
    this.k                 = k;
    this.a                 = a;

    // Move old coroutine out of the way and install `this` as current handler
    this.oldCoroutine      = env.coroutine;
    env.coroutine          = this;
  };

  HMC.prototype.run = function() {
    this.trace = makeTrace();
    this.trace.scoreUpdaterF = ad.add;
    return this.wpplFn(this.s, env.exit, this.a);
  };

  HMC.prototype.factor = function(s, k, a, score) {
    // add dummy trace entries to have a trace be a complete record
    this.trace.append(s, k, a, null, null, score, null);
    return ad.untapify(score) === -Infinity ? this.exit(s) : k(s);
  };

  HMC.prototype.sample = function(s, k, a, erp, params) {
    var proposal = this.proposals[a]; // has a proposal been made for this address?
    var _value = proposal ? valueUpdater.call(this, proposal) : erp.sample(ad.untapify(params))
    var value = erp.isContinuous() ? ad.tapify(_value) : _value;
    var score = erp.score(params, value);
    if (this.verbosity > 2)
      console.log('Sampling:', erp.sample.name, params, ad.untapify(value), ad.untapify(score))
    this.trace.append(s, k, a, erp, params, score, value);
    return ad.untapify(score) === -Infinity ? this.exit(s) : k(s, value);
  };

  HMC.prototype.computeGradient = function() {
    // compute gradient on trace -- updates value sensitivities in trace entries
    ad.yGradientR(this.trace.score());
    if (this.verbosity > 2)
      this.trace.forEach(function(te) {
        if (te.isContinuous())
          console.log('Gradient ' + te.address + ': ' + te.erpValue.sensitivity);
      })
  }

  // gets appropriately replaced by the current proposer
  HMC.prototype.computeAcceptance = function() { return 1.0 };

  HMC.prototype.propose = function() {
    // (re)initialize proposals
    this.proposals = {};

    // pick a proposer from a list of proposers and run
    this.proposerIndex = (this.proposerIndex + 1) % this.proposers.length;

    switch (this.proposers[this.proposerIndex]) {
    case 'leapfrog':
      // replace the `computeAcceptance` and `exit` methods (save exit)
      this.computeAcceptance = leapfrogAcceptance.bind(this);
      this.oldExit = this.exit;
      this.exit = leapfrogExit.bind(this);
      return this.leapfrogPropose()
      break;
    default:
      throw 'Only leafprog handled currently';
    }
  };

  // Leapfrog section --------------------------------------------------

  HMC.prototype.leapfrogPropose = function() {
    this.computeGradient();
    // p = p - (e/2 * (-dq))
    var cc = this;
    this.trace.forEach(function(entry) {
      if (entry.isContinuous()) {
        cc.proposals[entry.address] = makeProposal(ad.untapify(entry.erpValue),
                                                   entry.erpValue.sensitivity,
                                                   (erp.gaussianERP.sample([0.0, 1.0]) +
                                                    (cc.stepSize * entry.erpValue.sensitivity / 2)));
      }
    })

    if (this.verbosity > 2) {
      console.log('leapfrogPropose:')
      _.forEach(this.proposals, function(value, key) {
        var val = typeof value === 'function' ? 'function' : value;
        console.log(key + ':-> ' + JSON.stringify(val));
      })
    }

    this.step = this.steps - 1;
    // counterfactual update to get new state
    // q = q + e*p
    return this.run()
  };

  HMC.prototype.leapfrogStep = function() {
    this.step -= 1;

    this.computeGradient();
    // p = p - (e/2 * (-dq))
    var cc = this;
    this.trace.forEach(function(entry) {
      if (entry.isContinuous() && cc.proposals[entry.address]) {
        cc.proposals[entry.address].gradient = entry.erpValue.sensitivity;
        cc.proposals[entry.address].moment += (cc.stepSize * entry.erpValue.sensitivity);
      }
    })

    if (this.verbosity > 2) {
      console.log('leapfrogStep:')
      _.forEach(this.proposals, function(value, key) {
        var val = typeof value === 'function' ? 'function' : value;
        console.log(key + ':-> ' + JSON.stringify(val));
      })
    }

    // counterfactual update to get new state
    // q = q + e*p
    return this.run()
  };

  function valueUpdater(proposal) {
    return proposal.value + (this.stepSize * proposal.moment);
  }

  function leapfrogAcceptance() {
    if (this.oldProposals.U)
      return Math.exp(this.proposals.U - this.oldProposals.U +
                      this.oldProposals.K - this.proposals.K)
    else
      return 1.0
  }

  function leapfrogExit(s, value) {
    if (this.step > 0)
      // just go back to making the next leafprog step
      return this.leapfrogStep();

    this.computeGradient();
    // update last half-step for momentum
    var cc = this;
    this.trace.forEach(function(entry) {
      if (entry.isContinuous() && cc.proposals[entry.address]) {
        cc.proposals[entry.address].gradient = entry.erpValue.sensitivity;
        cc.proposals[entry.address].moment += (cc.stepSize * entry.erpValue.sensitivity / 2);
      }
    })

    // set U and K scores
    var K = 0;
    _.forEach(this.proposals, function(p, a) {K += Math.pow(p.moment, 2)});
    this.proposals.U = ad.untapify(this.trace.score());
    this.proposals.K = K / 2;

    // restore old exit so that normal service resumes
    this.exit = this.oldExit;
    return this.exit(s, value);
  }

  // ----------------------------------------------------------------------

  HMC.prototype.exit = function(s, value) {
    // rejection initializer
    if (this.iteration === this.iterations &&
        ad.untapify(this.trace.score()) === -Infinity) {
      if (this.verbosity > 0) console.log('Rejecting first trace! Rerunning...');
      return this.run();
    }

    this.iteration -= 1;

    var currentValue = value;
    var acceptance = this.computeAcceptance();
    if (this.verbosity > 1) console.log('Acceptance: ' + acceptance);
    if (isNaN(acceptance)) throw "HMC: Acceptance is NaN!"

    if (Math.random() < acceptance) { // accept
      this.oldValue = value;
      this.oldTrace = this.trace.clone(ad.add);
      this.oldProposals = _.clone(this.proposals);
      this.acceptedProposals += 1;
    } else {                          // reject
      currentValue = this.oldValue;
      this.trace = this.oldTrace.clone(ad.add);
      // no need to copy back oldProposals -- make new one when proposing anyways
    }
    this.updateHist(currentValue);

    if (this.verbosity > 1) {
      console.log('Value: ' + ad.untapify(currentValue));
      console.log('Iteration - ' + this.iteration);
    }

    return (this.iteration > 0) ?
      this.propose() :          // make a new proposal
      this.finish();            // finish up
  };

  // histogram should really be a class with it's own methods
  HMC.prototype.updateHist = function(val) {
    var v = ad.untapify(val);   // fixme: this is a hack
    var l = JSON.stringify(v);
    if (this.hist[l] === undefined) this.hist[l] = {prob: 0, val: v};
    this.hist[l].prob += 1;
  };

  HMC.prototype.finish = function() {
    if (this.verbosity > 0)
      console.log('Acceptance Ratio:',
                  this.acceptedProposals, this.iterations, this.acceptedProposals / this.iterations);
    // make return ERP
    var dist = erp.makeMarginalERP(this.hist);
    var k = this.k;
    // Reinstate previous coroutine
    env.coroutine = this.oldCoroutine;
    // Return by calling original continuation
    return k(this.s, dist);
  };

  function hmc(s, cc, a, wpplFn, opts) {
    return new HMC(s, cc, a, wpplFn, opts).run();
  };

  return {
    HMC: hmc
  };

};
