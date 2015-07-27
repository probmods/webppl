////////////////////////////////////////////////////////////////////
// HMC: Hamiltonian/Hybrid Monte Carlo
// TODO:
// - early exit leapfrog if score becomes -Infinity
// - don't rerun from start for leapfrog - rerun from `earliest` proposal
//   + can move the trace cutting and addressIndices cleanup into `propose` proper
// - mass term for momenta - currently 1.0
// - option to run mh only on discrete erps ?

'use strict';

var _ = require('underscore');
var erp = require('../erp.js');
var ad = require('ad.js')({mode: 'r'});

var util = require('../util.js');
var logsumexp = util.logsumexp;
var getOpt = util.getOpt;

var T = require('../trace');
var makeTrace = T.makeTrace
var makeHMCProposal = T.makeHMCProposal
var makeMHProposal = T.makeMHProposal

module.exports = function(env) {

  function HMC(s, k, a, wpplFn, opts) {
    this.stepSize = getOpt(opts, 'stepSize', 0.1);
    this.step = getOpt(opts, 'steps', 10);
    this.steps = getOpt(opts, 'steps', 10);
    this.iteration = getOpt(opts, 'iterations', 100);
    this.iterations = getOpt(opts, 'iterations', 100);
    this.kernels = getOpt(opts, 'kernels', ['leapfrog', 'mh']);
    this.aggregator = getOpt(opts, 'aggregator', 'count');
    this.verbosity = getOpt(opts, 'verbosity', 0);

    this.kernelIndex = 0;
    this.acceptedProposals = 0;
    this.trace = undefined;
    this.oldTrace = undefined;
    this.proposals = {};
    this.oldProposals = undefined;
    this.currentValue = undefined;
    this.oldValue = undefined;
    this.oldExit = undefined;

    this.hist = {};
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    // Move old coroutine out of the way and install `this` as current handler
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  };

  HMC.prototype.run = function() {
    this.trace = makeTrace();
    this.trace.scoreUpdaterF = ad.add;
    this.trace.addressIndices = {};
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  HMC.prototype.factor = function(s, k, a, score) {
    // add dummy trace entries to have a trace be a complete record
    this.trace.append(s, k, a, null, null, score, null); // clone store?
    return ad.untapify(score) === -Infinity ? this.exit(s) : k(s);
  };

  HMC.prototype.sample = function(s, k, a, erp, params) {
    var seenBefore = this.oldTrace ? this.oldTrace.indexOf(a) : undefined;
    var proposal = this.proposals[a];
    var _value;
    if (seenBefore !== undefined) { // exists in the old trace
      if (proposal) {             // propose change
        if (this.verbosity > 3) console.log('Seen before, but resampling')
        _value = proposal.update(this.stepSize);
      } else {                 // use old value, not being proposed to
        if (this.verbosity > 3) console.log('Seen before, and reusing')
        _value = ad.untapify(this.oldTrace.lookupAt(seenBefore).erpValue);
      }
    } else {                 // either first run or changed trace erps
      if (this.verbosity > 3) console.log('Not seen before')
      _value = erp.sample(ad.untapify(params));
    }
    var value = erp.isContinuous() ? ad.tapify(_value) : _value;
    var score = erp.score(params, value);

    // if mh kernel, keep track of fwd and rvs lp
    if (this.kernels[this.kernelIndex] === 'mh') {
      if (!seenBefore) {
        this.trace.fwdLP += ad.untapify(score);
      } else if (proposal) {
        this.trace.fwdLP += ad.untapify(score);
        this.trace.rvsLP += ad.untapify(this.oldTrace.lookupAt(seenBefore).erpScore);
      }
    }

    if (this.verbosity > 3)
      console.log('Sampling:', a, erp.sample.name, ad.untapify(params),
                  ad.untapify(value), ad.untapify(score))

    this.trace.append(_.clone(s), k, a, erp, params, score, value);
    return ad.untapify(score) === -Infinity ? this.exit(s) : k(s, value);
  };

  HMC.prototype.computeGradient = function() {
    // compute gradient on trace -- updates value sensitivities in trace entries
    ad.yGradientR(this.trace.score());
    if (this.verbosity > 3)
      this.trace.forEach(function(te) {
        if (te.isContinuous())
          console.log('Gradient ' + te.address + ': ' + te.erpValue.sensitivity);
      })
  }

  // dummy: gets appropriately replaced by the current kernel
  HMC.prototype.computeAcceptance = function() { return 1.0 };

  HMC.prototype.propose = function() {
    // (re)initialize proposals
    this.proposals = {};
    // pick a kernel from a list of kernels and run
    this.kernelIndex = (this.kernelIndex + 1) % this.kernels.length;
    switch (this.kernels[this.kernelIndex]) {
      case 'leapfrog':
        if (this.verbosity > 2)
          console.log('leapfrog proposal')
        // replace the `computeAcceptance` and `exit` methods
        this.computeAcceptance = leapfrogAcceptance.bind(this);
        this.oldExit = this.exit; //  save old exit
        this.exit = leapfrogExit.bind(this);
        return leapfrogPropose.bind(this)();
        break;
      case 'mh':
        if (this.verbosity > 2)
          console.log('mh proposal')
        // replace the `computeAcceptance`
        this.computeAcceptance = mhAcceptance.bind(this);
        return mhPropose.bind(this)();
        break;
      default:
        throw 'Only `leafprog` and `mh` handled currently!';
    }
  };

  // MH section --------------------------------------------------

  function mhAcceptance() {
    if (this.oldTrace === undefined) return 1.0;
    var newScore = ad.untapify(this.trace.score());
    if (newScore === -Infinity) return 0.0;
    var oldScore = ad.untapify(this.oldTrace.score());
    // compute fwd and rvs lp
    var fw = -Math.log(this.oldTrace.length()) + this.trace.fwdLP;
    var bw = -Math.log(this.trace.length()) + this.trace.rvsLP;
    // bw above is incomplete
    // update it with entries in oldTrace, but not in trace
    var cc = this;
    this.oldTrace.trace.slice(this.trace.startFrom).forEach(function(entry) {
      if (!cc.trace.lookup(entry.address))
        bw += ad.untapify(entry.erpScore);
    });
    return Math.exp(newScore - oldScore + bw - fw);
  }

  function mhPropose() {
    // select only from erp entries
    var erpAddresses = Object.keys(this.trace.addressIndices);
    var proposalAddr = erpAddresses[Math.floor(Math.random() * erpAddresses.length)];
    var proposalIndex = this.trace.indexOf(proposalAddr);
    var proposalEntry = this.trace.lookupAt(proposalIndex);
    this.trace.startFrom = proposalIndex;
    this.trace.trace = this.trace.trace.slice(0, proposalIndex); // truncate trace
    var cc = this;
    _.forEach(this.trace.addressIndices, function(i, a) {               // cleanup trace refs
      if (i >= proposalIndex) delete cc.trace.addressIndices[a]
    });
    this.trace.fwdLP = 0;
    this.trace.rvsLP = 0;
    // update proposals list
    this.proposals[proposalEntry.address] = makeMHProposal(ad.untapify(proposalEntry.erpValue),
                                                           proposalEntry.erp,
                                                           ad.untapify(proposalEntry.erpParams));
    if (this.verbosity > 3) {
      console.log('Proposing to: ' + proposalAddr + ' => ' + proposalEntry.erp.sample.name);
    }

    // return to proposed entry to resample
    return this.sample(_.clone(proposalEntry.store),
                       proposalEntry.continuation,
                       proposalEntry.address,
                       proposalEntry.erp,
                       proposalEntry.erpParams);
  }

  // -------------------------------------------------------------

  // Leapfrog section --------------------------------------------------

  function computeK(proposals) {
    var K = 0;
    _.forEach(proposals, function(p, a) {K += Math.pow(p.moment, 2)});
    return K / 2;
  }

  function leapfrogAcceptance() {
    if (this.oldTrace === undefined || this.oldProposals === undefined) return 1.0;
    var newU = ad.untapify(this.trace.score());
    if (newU === -Infinity) return 0.0;
    var oldU = ad.untapify(this.oldTrace.score());
    var newK = computeK(this.proposals);
    // fixme: this is redoing a computation we don't need to redo
    var oldK = computeK(this.oldProposals);
    return Math.exp(newU - oldU + oldK - newK);
  }

  function leapfrogPropose() {
    // cleanup the trace references for the new trace
    this.trace.addressIndices = {};
    this.oldProposals = {};     // this is to save the momenta at randomization

    this.computeGradient();
    // p = p - (e/2 * (-dq))
    var cc = this;
    this.trace.forEach(function(entry) {
      if (entry.isContinuous()) {
        var gradient = entry.erpValue.sensitivity;
        var moment = erp.gaussianERP.sample([0.0, 1.0]);
        cc.oldProposals[entry.address] = makeHMCProposal(ad.untapify(entry.erpValue),
                                                         gradient,
                                                         moment);
        cc.proposals[entry.address] = makeHMCProposal(ad.untapify(entry.erpValue),
                                                      gradient,
                                                      (moment + (cc.stepSize * gradient / 2)));
      }
    })

    if (this.verbosity > 3) {
      console.log('leapfrogPropose:')
      _.forEach(this.proposals, function(value, key) {console.log(key + ':-> ' + JSON.stringify(value));})
    }

    this.step = this.steps - 1;
    // counterfactual update to get new state
    // q = q + e*p
    return this.run()
  }

  function leapfrogStep() {
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

    if (this.verbosity > 3) {
      console.log('leapfrogStep:')
      _.forEach(this.proposals, function(value, key) {console.log(key + ':-> ' + JSON.stringify(value));})
    }

    // counterfactual update to get new state
    // q = q + e*p
    return this.run()
  }

  function leapfrogExit(s, value) {
    if (this.step > 0) {
      if (this.verbosity > 2) {
        console.log('  value: ' + ad.untapify(value))
        console.log('  score: ' + ad.untapify(this.trace.score()))
      }
      return leapfrogStep.bind(this)(); // make the next leafprog step
    }

    this.computeGradient();
    // update last half-step for momentum
    var cc = this;
    this.trace.forEach(function(entry) {
      if (entry.isContinuous() && cc.proposals[entry.address]) {
        cc.proposals[entry.address].gradient = entry.erpValue.sensitivity;
        cc.proposals[entry.address].moment += (cc.stepSize * entry.erpValue.sensitivity / 2);
      }
    })
    // note: no negation of `p` done here.

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

    var acceptance = this.computeAcceptance();
    if (this.verbosity > 1) console.log('Acceptance: ' + acceptance);
    if (isNaN(acceptance))
      throw 'HMC: Acceptance is NaN!'

    if (Math.random() < acceptance) { // accept
      if (this.verbosity > 1) console.log('Accepted!');
      this.currentValue = value;
      this.oldValue = value;
      this.oldTrace = this.trace.clone(ad.add);
      this.acceptedProposals += 1;
    } else {                          // reject
      if (this.verbosity > 1) console.log('Rejected!');
      this.currentValue = this.oldValue;
      this.trace = this.oldTrace.clone(ad.add);
      // no need to copy back oldProposals -- make new one when proposing anyways
    }
    this.updateHist(this.currentValue, this.trace.score());

    if (this.verbosity > 1) {
      console.log('Value: ' + ad.untapify(this.currentValue) +
                  '\n  Score: ' + ad.untapify(this.trace.score()));
      if (this.verbosity > 2 && this.iteration < this.iterations - 1)
        console.log('completed proposal');
      console.log('Iteration ------------------------------------------------ ' + this.iteration);
    }

    return (this.iteration > 0) ?
        this.propose() :          // make a new proposal
        this.finish();            // finish up
  };

  HMC.prototype.updateHist = function(value, score) {
    var s = JSON.stringify(ad.untapify(value));
    if (this.aggregator === 'score') {
      if (this.hist[s] === undefined)
        this.hist[s] = {prob: -Infinity, val: value};
      this.hist[s].prob = util.logsumexp([this.hist[s].prob,
                                          ad.untapify(score)]);
    } else {                    // aggregator = 'count'
      if (this.hist[s] === undefined)
        this.hist[s] = {prob: 0, val: value};
      this.hist[s].prob += 1;
    }
  };

  HMC.prototype.finish = function() {
    if (this.verbosity > 0)
      console.log('Acceptance Ratio:', this.acceptedProposals / this.iterations);
    // make return ERP
    var hist = this.aggregator === 'score' ? this.hist : util.logHist(this.hist);
    var dist = erp.makeMarginalERP(hist);
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
    _HMC: HMC,
    HMC: hmc
  };

};
