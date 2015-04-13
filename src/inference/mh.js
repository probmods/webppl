////////////////////////////////////////////////////////////////////
// Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var diagnostics = require('./mh-diagnostics/diagnostics.js')

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
    if ((oldTrace === undefined) || oldScore === -Infinity) {
      return 1;
    } // init
    var fw = -Math.log(oldTrace.length);
    trace.slice(regenFrom).map(function(s) {
      fw += s.reused ? 0 : s.choiceScore;
    });
    var bw = -Math.log(trace.length);
    oldTrace.slice(regenFrom).map(function(s) {
      var nc = findChoice(trace, s.name);
      bw += (!nc || !nc.reused) ? s.choiceScore : 0;
    });
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  function MH(s, k, a, wpplFn, numIterations, diagnostics) {

    this.trace = [];
    this.oldTrace = undefined;
    this.currScore = 0;
    this.oldScore = -Infinity;
    this.oldVal = undefined;
    this.regenFrom = 0;
    this.returnHist = {};
    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;
    this.vals = [];
    this.diagnostics = typeof diagnostics !== 'undefined' ? diagnostics : false;

    // Move old coroutine out of the way and install this as the current
    // handler.

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  MH.prototype.run = function() {
    return this.wpplFn(this.s, env.exit, this.a);
  };

  MH.prototype.factor = function(s, k, a, score) {
    this.currScore += score;
    return k(s);
  };

  MH.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var prev = findChoice(this.oldTrace, name);

    var reuse = !(prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    var choiceScore = erp.score(params, val);
    this.trace.push({
      k: cont, name: name, erp: erp, params: params,
      score: this.currScore, choiceScore: choiceScore,
      val: val, reused: reuse, store: _.clone(s)
    });
    this.currScore += choiceScore;
    return cont(s, val);
  };

  MH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      this.iterations -= 1;

      //did we like this proposal?
      var acceptance = acceptProb(this.trace, this.oldTrace,
          this.regenFrom, this.currScore, this.oldScore);
      if (Math.random() >= acceptance) {
        // if rejected, roll back trace, etc:
        this.trace = this.oldTrace;
        this.currScore = this.oldScore;
        val = this.oldVal;
      }
      if (this.diagnostics) {
        this.vals.push(val);
      }
      // now add val to hist:
      var stringifiedVal = JSON.stringify(val);
      if (this.returnHist[stringifiedVal] === undefined) {
        this.returnHist[stringifiedVal] = {prob: 0, val: val};
      }
      this.returnHist[stringifiedVal].prob += 1;

      // make a new proposal:
      this.regenFrom = Math.floor(Math.random() * this.trace.length);
      var regen = this.trace[this.regenFrom];
      this.oldTrace = this.trace;
      this.trace = this.trace.slice(0, this.regenFrom);
      this.oldScore = this.currScore;
      this.currScore = regen.score;
      this.oldVal = val;

      return this.sample(_.clone(regen.store), regen.k, regen.name, regen.erp, regen.params, true);
    } else {
      var dist = erp.makeMarginalERP(this.returnHist);

      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;
      if (this.diagnostics) {
        diagnostics.gweke(this.vals);
      }
      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  function mh(s, cc, a, wpplFn, numParticles) {
    return new MH(s, cc, a, wpplFn, numParticles).run();
  }

  return {
    MH: mh,
    findChoice: findChoice,
    acceptProb: acceptProb
  };

};
