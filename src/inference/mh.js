////////////////////////////////////////////////////////////////////
// Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');

module.exports = function(env) {

  function makeTraceEntry(s, k, name, erp, params, currScore, choiceScore, val, reuse) {
    return {k: k, name: name, erp: erp, params: params, score: currScore,
      choiceScore: choiceScore, val: val, reused: reuse, store: s};
  }

  var deepCopyTrace = function(trace) {
    return trace.map(function(obj) {
      var objCopy = _.clone(obj);
      objCopy.store = _.clone(obj.store);
      return objCopy;
    });
  };

  function acceptProb(currScore, oldScore, traceLength, oldTraceLength, bwdLP, fwdLP) {
    if (oldScore === -Infinity || oldTraceLength === 0) return 1; // initialize phase
    if (currScore === -Infinity) return 0; // early exit
    var fw = fwdLP - Math.log(oldTraceLength);
    var bw = bwdLP - Math.log(traceLength);
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    return Math.min(1, p);
  }

  function sampler(s, k, name, erp, params, forceSample) {
    var prev = this.sites[name];
    var reuse = !(prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    if (forceSample && prev && prev.val === val) { // exit early if proposed and no change
      this.sites = this.oldSites;
      this.trace = this.oldTrace;
      this.currScore = this.oldScore;
      return this.exit(s, this.oldVal);
    } else {
      var choiceScore = erp.score(params, val);
      var newEntry = makeTraceEntry(_.clone(s), k, name, erp, params,
                                    this.currScore, choiceScore, val, reuse)
      this.sites[name] = newEntry;
      this.currScore += choiceScore;
      this.trace.push(newEntry);
      if (prev === undefined) { // creating new choice
        this.fwdLP += choiceScore;
      } else if (forceSample) { // made a proposal to this choice
        this.fwdLP += choiceScore;
        this.bwdLP += prev.choiceScore;
      }
      return (choiceScore === -Infinity) ? this.exit(s) : k(s, val); // possible early exit
    }
  }

  function proposer(val, cloner) {
    this.regenFrom = Math.floor(Math.random() * this.trace.length);
    var regen = this.trace[this.regenFrom];
    this.oldSites = this.sites;
    this.sites = _.clone(this.sites);
    this.oldTrace = cloner === undefined ? this.trace : cloner(this.trace);
    this.trace = this.oldTrace.slice(0, this.regenFrom);
    this.fwdLP = 0;
    this.bwdLP = 0;
    this.oldScore = this.currScore;
    this.currScore = regen.score;
    this.oldVal = val;
    return this.sample(_.clone(regen.store), regen.k, regen.name, regen.erp, regen.params, true);
  }

  function MH(s, k, a, wpplFn, numIterations) {
    this.iterations = numIterations;
    this.totalIterations = numIterations;
    this.hist = {};
    this.numAccepted = 0;
    this.regenFrom = 0;

    this.wpplFn = wpplFn;
    this.k = k;
    this.oldStore = s;
    this.a = a;

    // Move old coroutine out of the way and install this as current handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  MH.prototype.run = function() {
    this.sites = {};
    this.trace = [];
    this.s = _.clone(this.oldStore);
    this.currScore = 0;
    this.oldScore = -Infinity;
    this.fwdLP = 0;
    this.bwdLP = 0;
    return this.wpplFn(this.s, env.exit, this.a);
  };

  MH.prototype.factor = function(s, k, a, score) {
    this.currScore += score;
    return this.currScore === -Infinity ? this.exit(s) : k(s); // possible early exit
  };

  MH.prototype.sample = function() {
    return sampler.apply(this, arguments);
  };

  MH.prototype.propose = function() {
    return proposer.apply(this, arguments);
  };

  MH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      if (this.iterations === this.totalIterations && this.currScore === -Infinity)
        return this.run();      // when uninitialized and failing, do rejection-sampling
      this.iterations -= 1;
      // housekeeping - remove dead refs and recompute backward logprob
      if (this.oldTrace !== undefined && this.currScore !== -Infinity) {
        var i, reached = {};
        for (i = this.regenFrom; i < this.trace.length; i++)
          reached[this.trace[i].name] = this.trace[i];
        for (i = this.regenFrom; i < this.oldTrace.length; i++) {
          var v = this.oldTrace[i];
          if (reached[v.name] === undefined) {
            delete this.sites[v.name];
            this.bwdLP += v.choiceScore;
          }
        }
      }
      // did we like this proposal?
      var acceptance = acceptProb(this.currScore,
                                  this.oldScore,
                                  this.trace.length,
                                  this.oldTrace === undefined ? 0 : this.oldTrace.length,
                                  this.bwdLP,
                                  this.fwdLP);
      // if rejected, roll back trace, etc:
      if (Math.random() >= acceptance) {
        this.sites = this.oldSites;
        this.trace = this.oldTrace;
        this.currScore = this.oldScore;
        val = this.oldVal;
      } else {
        this.numAccepted++;
      }
      // now add val to hist:
      var l = JSON.stringify(val);
      if (this.hist[l] === undefined) this.hist[l] = {prob: 0, val: val};
      this.hist[l].prob += 1;
      // make a new proposal
      return this.propose(val);
    } else {
      var dist = erp.makeMarginalERP(this.hist);
      dist.acceptanceRatio = this.numAccepted / this.totalIterations;
      var k = this.k;
      env.coroutine = this.oldCoroutine; // Reinstate previous coroutine
      return k(this.oldStore, dist); // Return by calling original continuation
    }
  };

  function mh(s, cc, a, wpplFn, numParticles) {
    return new MH(s, cc, a, wpplFn, numParticles).run();
  }

  return {
    MH: mh,
    makeTraceEntry: makeTraceEntry,
    deepCopyTrace: deepCopyTrace,
    sampler: sampler,
    proposer: proposer,
    acceptProb: acceptProb
  };

};
