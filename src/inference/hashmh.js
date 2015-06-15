////////////////////////////////////////////////////////////////////
// Lightweight MH, storing choices in a hash table

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');
var Query = require('../query.js').Query;

module.exports = function(env) {

  function acceptProb(currScore, oldScore, currN, oldN, rvsLP, fwdLP) {
    if (oldScore === -Infinity) { return 1; } // init
    if (currScore === -Infinity) return 0;  // auto-reject
    var fw = -Math.log(oldN) + fwdLP;
    var bw = -Math.log(currN) + rvsLP;
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  function HashMH(s, k, a, wpplFn, numIterations, opts) {
    // Extract opts
    var doFullRerun = opts.doFullRerun === undefined ? false : opts.doFullRerun;
    var verbose = opts.verbose === undefined ? false : opts.verbose;
    var justSample = opts.justSample === undefined ? false : opts.justSample;
    var onlyMAP = opts.onlyMAP === undefined ? false : opts.onlyMAP;
    var lag = opts.lag === undefined ? 1 : opts.lag;

    this.doFullRerun = doFullRerun;
    this.verbose = verbose;

    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;

    this.totalIterations = numIterations;
    this.acceptedProps = 0;

    this.lag = lag;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.onlyMAP = onlyMAP;
    if (justSample)
      this.returnSamps = [];
    else
      this.returnHist = {};
    this.MAP = { val: undefined, score: -Infinity };

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  HashMH.prototype.run = function() {
    this.vars = {};
    this.varlist = [];
    this.currScore = 0;
    this.fwdLP = 0;
    this.rvsLP = 0;
    this.oldScore = -Infinity;
    this.query = new Query();
    env.query.clear();
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  HashMH.prototype.factor = function(s, k, a, score) {
    this.currScore += score;
    // Bail out early if score became -Infinity
    if (this.currScore === -Infinity)
      return this.exit();
    else
      return k(s);
  };

  HashMH.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var prev = this.vars[name];

    var reuse = ! (prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    // On proposal: bail out early if the value didn't change
    if (forceSample && prev.val === val) {
      this.vars = this.oldVars;
      this.varlist = this.oldvarlist;
      this.currScore = this.oldScore;
      return this.exit(null, this.oldVal);
    } else {
      var choiceScore = erp.score(params, val);
      var newEntry = {k: cont, name: name, erp: erp, params: params,
        score: this.currScore, choiceScore: choiceScore,
        val: val, reused: reuse, store: _.clone(s)};
      this.vars[name] = newEntry;
      // Case: we just created this choice for the first time
      if (prev === undefined)
        this.fwdLP += choiceScore;
      // Case: we made a proposal to this choice
      else if (forceSample) {
        this.fwdLP += choiceScore;
        this.rvsLP += prev.choiceScore;
      }
      // Bail out early if score became -Infinity
      if (choiceScore === -Infinity)
        return this.exit();
      // Re-run from the start, if this was a proposal and we're
      //    doing full re-runs
      else if (forceSample && this.doFullRerun)
        return this.wpplFn(this.s, env.exit, this.a);
      // Otherwise, move on by invoking current continuation
      else {
        this.currScore += choiceScore;
        this.varlist.push(newEntry);
        return cont(s, val);
      }
    }
  };

  HashMH.prototype.isInitialized = function() {
    return this.iterations < this.totalIterations;
  };

  HashMH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      // Initialization: Keep rejection sampling until we get a trace with
      //    non-zero probability
      if (!this.isInitialized() && this.currScore === -Infinity) {
        return this.run();
      } else {
        if (this.verbose)
          console.log('HashMH iteration ' + (this.totalIterations - this.iterations) +
              ' / ' + this.totalIterations);
        this.iterations -= 1;

        // Clean out any dead vars and calculate reverse LP
        if (this.oldvarlist !== undefined && this.currScore !== -Infinity) {
          var reached = {};
          for (var i = this.propIdx; i < this.varlist.length; i++)
            reached[this.varlist[i].name] = this.varlist[i];
          for (var i = this.propIdx; i < this.oldvarlist.length; i++) {
            var v = this.oldvarlist[i];
            if (reached[v.name] === undefined) {
              delete this.vars[v.name];
              this.rvsLP += v.choiceScore;
            }
          }
        }

        // did we like this proposal?
        var oldN = this.oldvarlist === undefined ? 0 : this.oldvarlist.length;
        var acceptance = acceptProb(this.currScore, this.oldScore,
                                    this.varlist.length, oldN,
                                    this.rvsLP, this.fwdLP);
        if (Math.random() >= acceptance) {
          // if rejected, roll back trace, etc:
          this.vars = this.oldVars;
          this.varlist = this.oldvarlist;
          this.currScore = this.oldScore;
          val = this.oldVal;
        } else {
          this.acceptedProps++;
          this.query.addAll(env.query);
        }
        env.query.clear();

        // Record this sample, if lag allows for it
        var iternum = this.totalIterations - this.iterations;
        if (iternum % this.lag === 0) {
          // Replace val with accumulated query, if need be.
          if (val === env.query)
            val = this.query.getTable();
          // add val to hist:
          if (!this.onlyMAP) {
            if (this.returnSamps)
              this.returnSamps.push({score: this.score, value: val})
            else {
              var stringifiedVal = JSON.stringify(val);
              if (this.returnHist[stringifiedVal] === undefined) {
                this.returnHist[stringifiedVal] = { prob: 0, val: val };
              }
              this.returnHist[stringifiedVal].prob += 1;
            }
          }
          // also update the MAP
          if (this.currScore > this.MAP.score) {
            this.MAP.score = this.currScore;
            this.MAP.value = val;
          }
        }

        // make a new proposal:
        this.propIdx = Math.floor(Math.random() * this.varlist.length);
        var entry = this.varlist[this.propIdx];
        this.oldVars = this.vars;
        this.vars = _.clone(this.vars);
        this.oldvarlist = this.varlist;
        this.fwdLP = 0;
        this.rvsLP = 0;
        this.oldScore = this.currScore;
        this.oldVal = val;

        // Do we re-run from the beginning of the program, or use the continuation
        //    at this random choice?
        if (this.doFullRerun) {
          this.varlist = [];
          this.currScore = 0;
        } else {
          this.varlist = this.oldvarlist.slice(0, this.propIdx);
          this.currScore = entry.score;
        }
        return this.sample(_.clone(entry.store), entry.k, entry.name, entry.erp, entry.params, true);
      }
    } else {
      var dist;
      if (this.returnHist)
        dist = erp.makeMarginalERP(this.returnHist);
      else
        dist = erp.makeMarginalERP({});
      if (this.returnSamps) {
        if (this.onlyMAP)
          this.returnSamps.push(this.MAP);
        dist.samples = this.returnSamps;
      }
      dist.MAP = this.MAP.value;

      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;

      console.log('Acceptance ratio: ' + this.acceptedProps / this.totalIterations);

      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  HashMH.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function hashmh(s, cc, a, wpplFn, numParticles, opts) {
    opts = opts || {};
    return new HashMH(s, cc, a, wpplFn, numParticles, opts).run();
  }

  return {
    HashMH: hashmh
  };

};
