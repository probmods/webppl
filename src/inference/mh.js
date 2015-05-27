////////////////////////////////////////////////////////////////////
// Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');

module.exports = function(env) {

  function findChoice(trace, name) {
    if (trace === undefined) {
      return undefined;
    }
    for (var i = 0; i < trace.length; i++) {
      if (trace[i].name === name) {
        return trace[i];
      }
    }
    return undefined;
  }

  function acceptProb(trace, oldTrace, regenFrom, currScore, oldScore) {
    if ((oldTrace === undefined) || oldScore === -Infinity) {return 1;} // init
    if (currScore === -Infinity) return 0; // auto-reject
    var fw = -Math.log(oldTrace.length);
    trace.slice(regenFrom).map(function(s) {fw += s.reused ? 0 : s.choiceScore;});
    var bw = -Math.log(trace.length);
    oldTrace.slice(regenFrom).map(function(s) {
      var nc = findChoice(trace, s.name);
      bw += (!nc || !nc.reused) ? s.choiceScore : 0; });
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  function MH(s, k, a, wpplFn, numIterations, verbose, justSample) {

    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;

    this.totalIterations = numIterations;
    this.acceptedProps = 0;

    this.verbose = verbose;

    // Move old coroutine out of the way and install this as the current
    // handler.

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    if (justSample)
      this.returnSamps = [];
    else
      this.returnHist = {};
    this.MAP = { val: undefined, score: -Infinity };

    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  MH.prototype.run = function() {
    this.trace = [];
    this.oldTrace = undefined;
    this.currScore = 0;
    this.oldScore = -Infinity;
    this.oldVal = undefined;
    this.regenFrom = 0;
    return this.wpplFn(this.s, env.exit, this.a);
  };

  MH.prototype.factor = function(s, k, a, score) {
    this.currScore += score;
    // Bail out early if score became -Infinity
    if (this.currScore === -Infinity)
      return this.exit();
    else
      return k(s);
  };

  MH.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var prev = findChoice(this.oldTrace, name);

    var reuse = ! (prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    // On proposal: bail out early if the value didn't change
    if (forceSample && prev.val === val) {
      this.trace = this.oldTrace;
      this.currScore = this.oldScore;
      return this.exit(null, this.oldVal);
    } else {
      var choiceScore = erp.score(params, val);
      this.trace.push({k: cont, name: name, erp: erp, params: params,
        score: this.currScore, choiceScore: choiceScore,
        val: val, reused: reuse, store: _.clone(s)});
      this.currScore += choiceScore;
      // Bail out early if score became -Infinity
      if (this.currScore === -Infinity)
        return this.exit();
      else
        return cont(s, val);
    }
  };

  MH.prototype.isInitialized = function() {
    return this.iterations < this.totalIterations;
  };

  MH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      // Initialization: Keep rejection sampling until we get a trace with
      //    non-zero probability
      if (!this.isInitialized() && this.currScore === -Infinity) {
        return this.run();
      } else {
        if (this.verbose)
          console.log("MH iteration " + (this.totalIterations - this.iterations) +
            " / " + this.totalIterations);
        this.iterations -= 1;

        //did we like this proposal?
        var acceptance = acceptProb(this.trace, this.oldTrace,
            this.regenFrom, this.currScore, this.oldScore);
        if (Math.random() >= acceptance) {
          // if rejected, roll back trace, etc:
          this.trace = this.oldTrace;
          this.currScore = this.oldScore;
          val = this.oldVal;
        } else this.acceptedProps++;

        // now add val to hist:
        if (this.returnSamps)
          this.returnSamps.push({score: this.currScore, value: val})
        else {
          var stringifiedVal = JSON.stringify(val);
          if (this.returnHist[stringifiedVal] === undefined) {
            this.returnHist[stringifiedVal] = { prob: 0, val: val };
          }
          this.returnHist[stringifiedVal].prob += 1;
        }
        // also update the MAP
        if (this.currScore > this.MAP.score) {
          this.MAP.score = this.currScore;
          this.MAP.value = val;
        }

        // make a new proposal:
        this.regenFrom = Math.floor(Math.random() * this.trace.length);
        var regen = this.trace[this.regenFrom];
        this.oldTrace = this.trace;
        this.trace = this.trace.slice(0, this.regenFrom);
        this.oldScore = this.currScore;
        this.currScore = regen.score;
        this.oldVal = val;

        return this.sample(_.clone(regen.store), regen.k, regen.name, regen.erp, regen.params, true);
      }
    } else {
      var dist;
      if (this.returnHist)
        dist = erp.makeMarginalERP(this.returnHist);
      else
        dist = erp.makeMarginalERP({});
      if (this.returnSamps)
        dist.samples = this.returnSamps;
      dist.MAP = this.MAP.val;

      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;

      console.log("Acceptance ratio: " + this.acceptedProps / this.totalIterations);

      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  MH.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function mh(s, cc, a, wpplFn, numParticles, verbose, justSample) {
    return new MH(s, cc, a, wpplFn, numParticles, verbose, justSample).run();
  }

  return {
    MH: mh,
    findChoice: findChoice,
    acceptProb: acceptProb
  };

};
