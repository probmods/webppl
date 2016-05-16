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
var ScoreAggregator = require('../aggregation/ScoreAggregator');

module.exports = function(env) {

  function Enumerate(store, k, a, wpplFn, options) {
    util.throwUnlessOpts(options, 'Enumerate');
    options = util.mergeDefaults(options, {
      maxExecutions: Infinity
    });
    this.maxExecutions = options.maxExecutions;
    this.score = 0; // Used to track the score of the path currently being explored
    this.marginal = new ScoreAggregator(); // We will accumulate the marginal distribution here
    this.numCompletedExecutions = 0;
    this.store = store; // will be reinstated at the end
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;

    // Queue of states that we have yet to explore.  This queue is a
    // bunch of computation states. Each state is a continuation, a
    // value to apply it to, and a score.
    var strategy = strategies[options.strategy] || defaultStrategy(options.maxExecutions);
    this.queue = strategy.makeQ();

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

  var getSupport = function(dist) {
    // Find support of this distribution:
    if (dist.isContinuous || !dist.support) {
      console.error(dist);
      throw 'Enumerate can only be used with distributions that have finite support.';
    }
    var supp = dist.support();

    // Check that support is non-empty
    if (supp.length === 0) {
      console.error(dist);
      throw 'Enumerate encountered a distribution with empty support!';
    }

    return supp;
  };

  Enumerate.prototype.sample = function(store, k, a, dist) {
    var support = getSupport(dist);

    // For each value in support, add the continuation paired with
    // support value and score to queue:
    _.each(support, function(value) {
      this.enqueueContinuation(
          k, value, this.score + dist.score(value), store);
    }, this);

    // Call the next state on the queue
    return this.nextInQueue();
  };

  Enumerate.prototype.factor = function(s, k, a, score) {
    // Update score and continue
    this.score += score;
    if (this.score === -Infinity) {
      return this.exit();
    }
    return k(s);
  };

  Enumerate.prototype.sampleWithFactor = function(store, k, a, dist, scoreFn) {
    var support = getSupport(dist);

    // Allows extra factors to be taken into account in making
    // exploration decisions:

    return util.cpsForEach(
        function(value, i, support, nextK) {
          return scoreFn(store, function(store, extraScore) {
            var score = env.coroutine.score + dist.score(value) + extraScore;
            env.coroutine.enqueueContinuation(k, value, score, store);
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
      return this.k(this.store, this.marginal.toDist());
    }
  };

  Enumerate.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  var strategies = {
    'likely-first': {
      makeQ: function() {
        return new PriorityQueue(function(a, b) {
          return a.score - b.score;
        });
      }
    },
    'depth-first': {
      makeQ: function() {
        var q = [];
        q.size = function() {
          return q.length;
        };
        q.enq = q.push;
        q.deq = q.pop;
        return q;
      }
    },
    'breadth-first': {
      makeQ: function() {
        var q = [];
        q.size = function() {
          return q.length;
        };
        q.enq = q.push;
        q.deq = q.shift;
        return q;
      }
    }
  };

  function defaultStrategy(maxExecutions) {
    return strategies[_.isFinite(maxExecutions) ? 'likely-first' : 'depth-first'];
  }

  return {
    Enumerate: function(s, k, a, wpplFn, options) {
      return new Enumerate(s, k, a, wpplFn, options).run();
    }
  };

};
