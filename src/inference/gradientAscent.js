////////////////////////////////////////////////////////////////////
// Gradient Ascent
// TODO:
// - annealing

'use strict';

var _ = require('underscore');
var erp = require('../erp.js');
var ad = require('ad.js')({mode: 'r'})
var logsumexp = require('../util.js').logsumexp

var T = require('../trace');
var makeTrace = T.makeTrace
var makeGradProposal = T.makeGradProposal

module.exports = function(env) {

  function getOpt(value, defaultValue) { return value === undefined ? defaultValue : value; };

  function sigmoid(x) { return (1 / (1 + Math.exp(-x))) - 0.5; }

  function Grad(s, k, a, wpplFn, opts) {
    this.stepSize = getOpt(opts.stepSize, 0.1);
    this.step = getOpt(opts.steps, 3000);
    this.steps = getOpt(opts.steps, 3000);
    this.verbosity = getOpt(opts.verbosity, 0);

    this.trace = undefined;
    this.proposals = {};

    this.hist = {};
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    // Move old coroutine out of the way and install this as current handler.
    this.oldCoroutin = env.coroutine;
    env.coroutine = this;
  }

  Grad.prototype.run = function() {
    this.trace = makeTrace();
    this.trace.scoreUpdaterF = ad.add;
    this.trace.addressIndices = {};
    return this.wpplFn(this.s, env.exit, this.a);
  };

  Grad.prototype.factor = function(s, k, a, score) {
    // add dummy trace entries to have a trace be a complete record
    this.trace.append(s, k, a, null, null, score, null);
    return ad.untapify(score) === -Infinity ? this.exit(s) : k(s);
  };

  // needswork
  Grad.prototype.sample = function(s, k, a, erp, params) {
    var proposal = this.proposals[a]; // has a proposal been made for this address?
    var _value = proposal ? proposal.update(sigmoid, this.stepSize) : erp.sample(ad.untapify(params))
    var value = erp.isContinuous() ? ad.tapify(_value) : _value;
    var score = erp.score(params, value);
    if (this.verbosity > 3)
      console.log('Sampling:', erp.sample.name, params, ad.untapify(value), ad.untapify(score))
    this.trace.append(s, k, a, erp, params, score, value);
    return ad.untapify(score) === -Infinity ? this.exit(s) : k(s, value);
  };

  Grad.prototype.computeGradient = function() {
    // compute gradient on trace -- updates value sensitivities in trace entries
    ad.yGradientR(this.trace.score());
    if (this.verbosity > 2)
      this.trace.forEach(function(te) {
        if (te.isContinuous())
          console.log('Gradient ' + te.address + ': ' + te.erpValue.sensitivity);
      })
  }

  Grad.prototype.propose = function() {
    // (re)initialize proposals
    this.proposals = {};
    // compute gradient
    this.computeGradient();
    // record gradients in proposals
    var cc = this;
    this.trace.forEach(function(entry) {
      if (entry.isContinuous())
        cc.proposals[entry.address] = makeGradProposal(ad.untapify(entry.erpValue),
                                                       entry.erpValue.sensitivity);
    })
    // recompute score from the start of the trace
    return this.run()
  };

  Grad.prototype.exit = function(s, val) {
    // rejection initializer
    if (this.step === this.steps && ad.untapify(this.trace.score()) === -Infinity) {
      if (this.verbosity > 1) console.log('Rejecting first trace! Rerunning...');
      return this.run();
    }

    if (this.step === 0)
      return this.finish();
    this.step -= 1;

    if (this.verbosity > 1) console.log('Value:', ad.untapify(val));
    this.updateHist(val)

    // make a new proposal
    return this.propose();
  };

  Grad.prototype.updateHist = function(val) {
    var v = ad.untapify(val);   // fixme: this is a hack
    var l = JSON.stringify(v);
    if (this.hist[l] === undefined) this.hist[l] = {prob: 0, val: v};
    this.hist[l].prob = logsumexp([this.hist[l].prob,
                                   ad.untapify(this.trace.score())]);
  }

  Grad.prototype.finish = function() {
    // add last value into hist and build erp
    // this.updateHist(val);
    var dist = erp.makeMarginalERP(this.hist);

    var k = this.k;
    // Reinstate previous coroutine
    env.coroutine = this.oldCoroutine;
    // Return by calling original continuation
    return k(this.oldStore, dist);
  }

  function grad(s, cc, a, wpplFn, opts) {
    return new Grad(s, cc, a, wpplFn, opts).run();
  }

  return {
    GradientAscent: grad
  };

};
