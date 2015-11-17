'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp');
var util = require('../util');

module.exports = function(env) {

  function MHKernel(k, runWppl, oldTrace, options) {
    var options = util.mergeDefaults(options, {
      proposalBoundary: 0,
      exitFactor: 0,
      permissive: false,
      discreteOnly: false
    });

    if (!options.permissive) {
      assert.notStrictEqual(oldTrace.score, -Infinity);
    }

    this.k = k;
    this.oldTrace = oldTrace;
    this.reused = {};

    this.proposalBoundary = options.proposalBoundary;
    this.proposalFilter = options.discreteOnly ?
        function(erp) { return !erp.isContinuous; } :
        function(erp) { return true; };
    this.exitFactor = options.exitFactor;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  MHKernel.prototype.run = function() {
    var indices = proposeableIndices(this.oldTrace, this.proposalBoundary, this.proposalFilter);
    var numERP = indices.length;
    if (numERP === 0) {
      return this.cont(this.oldTrace, true);
    }
    // Make a new proposal.
    env.query.clear();
    this.regenFrom = indices[Math.floor(util.random() * numERP)];
    this.trace = this.oldTrace.upto(this.regenFrom);
    var regen = this.oldTrace.choiceAtIndex(this.regenFrom);
    return this.sample(_.clone(regen.store), regen.k, regen.address, regen.erp, regen.params, true);
  };

  MHKernel.prototype.factor = function(s, k, a, score) {
    // Optimization: Bail early if we know acceptProb will be zero.
    if (ad.untapify(score) === -Infinity) {
      return this.cont(this.oldTrace, false);
    }
    this.trace.numFactors += 1;
    this.trace.score = ad.add(this.trace.score, score);
    if (this.trace.numFactors === this.exitFactor) {
      this.trace.saveContinuation(s, k);
      return this.exit(s, undefined, true);
    }
    return k(s);
  };

  MHKernel.prototype.sample = function(s, k, a, erp, params, forceSample) {
    var _val, val;
    var prevChoice = this.oldTrace.findChoice(a);

    if (forceSample) {
      assert(prevChoice);
      var proposalErp = erp.proposer || erp;
      var proposalParams = erp.proposer ? [params, prevChoice.val] : params;
      _val = proposalErp.sample(ad.untapify(proposalParams));
      val = proposalErp.isContinuous ? ad.tapify(_val) : _val;
      // Optimization: Bail early if same value is re-sampled.
      if (!proposalErp.isContinuous && prevChoice.val === val) {
        return this.cont(this.oldTrace, true);
      }
    } else {
      if (prevChoice) {
        val = prevChoice.val; // Will be a tape if continuous.
        this.reused[a] = true;
      } else {
        _val = erp.sample(ad.untapify(params));
        val = erp.isContinuous ? ad.tapify(_val) : _val;
      }
    }

    this.trace.addChoice(erp, params, val, a, s, k);
    if (ad.untapify(this.trace.score) === -Infinity) {
      return this.cont(this.oldTrace, false);
    }
    return k(s, val);
  };

  MHKernel.prototype.exit = function(s, val, earlyExit) {
    if (!earlyExit) {
      this.trace.complete(val);
    } else {
      assert(this.trace.store);
      assert(this.trace.k);
      assert(!this.trace.isComplete());
    }
    var prob = acceptProb(
        this.trace, this.oldTrace,
        this.regenFrom, this.reused,
        this.proposalBoundary, this.proposalFilter);
    var accept = util.random() < prob;
    return this.cont(accept ? this.trace : this.oldTrace, accept);
  };

  MHKernel.prototype.cont = function(trace, accepted) {
    assert(_.isBoolean(accepted));
    env.coroutine = this.coroutine;
    trace.info = { accepted: accepted };
    return this.k(trace);
  };

  MHKernel.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function proposeableIndices(trace, boundary, pred) {
    return _.range(boundary, trace.length).filter(function(i) {
      return pred(trace.choices[i].erp);
    }, this);
  }

  function acceptProb(trace, oldTrace, regenFrom, reused, proposalBoundary, proposalFilter) {
    // assert.notStrictEqual(trace, undefined);
    // assert.notStrictEqual(oldTrace, undefined);
    // assert(_.isNumber(ad.untapify(trace.score)));
    // assert(_.isNumber(ad.untapify(oldTrace.score)));
    // assert(_.isNumber(regenFrom));
    // assert(_.isNumber(proposalBoundary));

    var fw = transitionProb(oldTrace, trace, regenFrom, reused, proposalBoundary, proposalFilter);
    var bw = transitionProb(trace, oldTrace, regenFrom, reused, proposalBoundary, proposalFilter);
    var p = Math.exp(ad.untapify(trace.score) - ad.untapify(oldTrace.score) + bw - fw);
    assert(!isNaN(p));
    return Math.min(1, p);
  }

  function transitionProb(fromTrace, toTrace, regenFrom, reused, proposalBoundary, proposalFilter) {
    // Proposed to ERP.
    var proposalErp, proposalParams;
    var regenChoice = toTrace.choiceAtIndex(regenFrom);

    if (regenChoice.erp.proposer) {
      proposalErp = regenChoice.erp.proposer;
      proposalParams = [regenChoice.params, fromTrace.choiceAtIndex(regenFrom).val];
    } else {
      proposalErp = regenChoice.erp;
      proposalParams = regenChoice.params;
    }

    var score = ad.untapify(proposalErp.score(proposalParams, regenChoice.val));

    // Rest of the trace.
    score += util.sum(toTrace.choices.slice(regenFrom + 1).map(function(choice) {
      return reused.hasOwnProperty(choice.address) ? 0 : ad.untapify(choice.erp.score(choice.params, choice.val));
    }));

    score -= Math.log(proposeableIndices(fromTrace, proposalBoundary, proposalFilter).length);
    assert(!isNaN(score));
    return score;
  }

  return function(k, runWppl, oldTrace, options) {
    return new MHKernel(k, runWppl, oldTrace, options).run();
  };

};
