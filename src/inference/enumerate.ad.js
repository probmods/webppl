////////////////////////////////////////////////////////////////////
// Enumeration
//
// Depth-first enumeration of all the paths through the computation.
// Q is the queue object to use. It should have enq, deq, and size methods.

'use strict';
'use ad';

var _ = require('underscore');
var PriorityQueue = require('priorityqueuejs');
var util = require('../util');
var Distribution = require('../aggregation/distribution');

module.exports = function(env) {

  function Enumerate(store, k, a, wpplFn, maxExecutions, Q) {
    this.score = 0; // Used to track the score of the path currently being explored
    this.marginal = new Distribution(); // We will accumulate the marginal distribution here
    this.numCompletedExecutions = 0;
    this.store = store; // will be reinstated at the end
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.maxExecutions = maxExecutions || Infinity;

    // Queue of states that we have yet to explore.  This queue is a
    // bunch of computation states. Each state is a continuation, a
    // value to apply it to, and a score.
    this.queue = Q;

    // Move old coroutine out of the way
    // and install this as the current handler
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  Enumerate.prototype.run = function() {
    // Run the wppl computation, when the computation returns we want it
    // to call the exit method of this coroutine so we pass that as the
    // continuation.
    return this.wpplFn(_.clone(this.store), env.exit, this.a);
  };

  Enumerate.prototype.nextInQueue = function() {
    var nextState = this.queue.deq();
    this.score = nextState.score;
    return nextState.continuation(nextState.store, nextState.value);
  };

  Enumerate.prototype.enqueueContinuation = function(continuation, value, score, store) {
    var state = {
      continuation: continuation,
      value: value,
      score: score,
      store: _.clone(store)
    };
    this.queue.enq(state);
  };

  var getSupport = function(dist, params) {
    // Find support of this erp:
    if (dist.isContinuous || !dist.support) {
      console.error(dist, params);
      throw 'Enumerate can only be used with ERPs that have finite support.';
    }
    var supp = dist.support(params);

    // Check that support is non-empty
    if (supp.length === 0) {
      console.error(dist, params);
      throw 'Enumerate encountered ERP with empty support!';
    }

    return supp;
  };

  Enumerate.prototype.sample = function(store, cc, a, dist, params) {
    var support = getSupport(dist, params);

    // For each value in support, add the continuation paired with
    // support value and score to queue:
    _.each(support, function(value) {
      this.enqueueContinuation(
          cc, value, this.score + dist.score(params, value), store);
    }, this);

    // Call the next state on the queue
    return this.nextInQueue();
  };

  Enumerate.prototype.factor = function(s, cc, a, score) {
    // Update score and continue
    this.score += score;
    if (this.score === -Infinity) {
      return this.exit();
    }
    return cc(s);
  };

  Enumerate.prototype.sampleWithFactor = function(store, cc, a, dist, params, scoreFn) {
    var support = getSupport(dist, params);

    // Allows extra factors to be taken into account in making
    // exploration decisions:

    return util.cpsForEach(
        function(value, i, support, nextK) {
          return scoreFn(store, function(store, extraScore) {
            var score = env.coroutine.score + dist.score(params, value) + extraScore;
            env.coroutine.enqueueContinuation(cc, value, score, store);
            return nextK();
          }, a, value);
        },
        function() {
          // Call the next state on the queue
          return env.coroutine.nextInQueue();
        },
        support);
  };

  Enumerate.prototype.exit = function(s, retval) {
    // We have reached an exit of the computation. Accumulate probability into retval bin.
    this.marginal.add(retval, this.score);

    // Increment the completed execution counter
    this.numCompletedExecutions += 1;

    // If anything is left in queue do it:
    if (this.queue.size() > 0 && (this.numCompletedExecutions < this.maxExecutions)) {
      return this.nextInQueue();
    } else {
      if (this.marginal.size === 0) {
        throw 'All paths explored by Enumerate have probability zero.';
      }
      // Reinstate previous coroutine:
      env.coroutine = this.coroutine;
      // Return from enumeration by calling original continuation with original store:
      return this.k(this.store, this.marginal.toERP());
    }
  };

  Enumerate.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  //helper wraps with 'new' to make a new copy of Enumerate and set 'this' correctly..
  function enuPriority(s, cc, a, wpplFn, maxExecutions) {
    var q = new PriorityQueue(function(a, b) {
      return a.score - b.score;
    });
    return new Enumerate(s, cc, a, wpplFn, maxExecutions, q).run();
  }

  function enuFilo(s, cc, a, wpplFn, maxExecutions) {
    var q = [];
    q.size = function() {
      return q.length;
    };
    q.enq = q.push;
    q.deq = q.pop;
    return new Enumerate(s, cc, a, wpplFn, maxExecutions, q).run();
  }

  function enuFifo(s, cc, a, wpplFn, maxExecutions) {
    var q = [];
    q.size = function() {
      return q.length;
    };
    q.enq = q.push;
    q.deq = q.shift;
    return new Enumerate(s, cc, a, wpplFn, maxExecutions, q).run();
  }

  function enuDefault(s, cc, a, wpplFn, maxExecutions) {
    var enu = _.isFinite(maxExecutions) ? enuPriority : enuFilo;
    return enu(s, cc, a, wpplFn, maxExecutions);
  }

  return {
    Enumerate: enuDefault,
    EnumerateBreadthFirst: enuFifo,
    EnumerateDepthFirst: enuFilo,
    EnumerateLikelyFirst: enuPriority
  };

};
