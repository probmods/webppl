////////////////////////////////////////////////////////////////////
// Enumeration
//
// Depth-first enumeration of all the paths through the computation.
// Q is the queue object to use. It should have enq, deq, and size methods.

'use strict';
'use ad';

var _ = require('lodash');
var PriorityQueue = require('priorityqueuejs');
var util = require('../util');
var ScoreAggregator = require('../aggregation/ScoreAggregator');

module.exports = function(env) {

  function Enumerate(store, k, a, wpplFn, options) {
    util.throwUnlessOpts(options, 'Enumerate');
    options = util.mergeDefaults(options, {
      maxExecutions: Infinity,
      throwOnError: true,
      maxRuntimeInMS: Infinity,
      maxEnumTreeSize: Infinity
    });

    this.throwOnError = options.throwOnError;
    this.maxRuntimeInMS = options.maxRuntimeInMS; // Time upper threshold for enumeration
    this.startTime = Date.now();
    this.firstPath = true; // whether enumeration has reached the first leaf/exit
    this.levelSizes = [];

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
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  Enumerate.prototype.run = function() {
    // Run the wppl computation, when the computation returns we want it
    // to call the exit method of this coroutine so we pass that as the
    // continuation.
    return this.wpplFn(_.clone(this.store), env.exit, this.a);
  };

  // Error function for error handling
  // this.throwOnError is true: directly throw error
  // this.throwOnError is false: return error (string) as infer result
  Enumerate.prototype.error = function(errType) {
    var err = new Error(errType);
    if (this.throwOnError) {
      throw err;
    } else {
      return this.k(this.store, err);
    }
  }

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

  var getSupport = function(dist, cont) {
    // Find support of this distribution:
    if (dist.isContinuous || !dist.support) {
      console.error(dist);
      return env.coroutine.error('Enumerate can only be used with distributions that have finite support.');
    }
    var supp = dist.support();

    // Check that support is non-empty
    if (supp.length === 0) {
      console.error(dist);
      return env.coroutine.error('Enumerate encountered a distribution with empty support.');
    }
    return cont(supp);
  };

  Enumerate.prototype.sample = function(store, k, a, dist) {
    return getSupport(dist, function(support) {
      if (isFinite(this.maxRuntimeInMS)) {
        // Time checker
        if (Date.now() - this.startTime > this.maxRuntimeInMS) {
          return this.error('Enumerate timeout: max time was set to ' +
              this.maxRuntimeInMS);
        }
      }
      if (isFinite(this.maxEnumTreeSize)) {
        this.levelSizes.push(support.length);
      }
      // For each value in support, add the continuation paired with
      // support value and score to queue:
      _.each(support, function(value) {
        this.enqueueContinuation(
            k, value, this.score + dist.score(value), store);
      }.bind(this));

      // Call the next state on the queue
      return this.nextInQueue();
    }.bind(this));
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
    return getSupport(dist, function(support) {
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
    });
  };

  var estimateEnumTreeSize = function(sizes) {
    // Estimate enumeration tree size by support length at each level
    var numNodes = 1;
    var enumTreeSize = 1;
    for (var i in sizes) {
      numNodes *= sizes[i];
      enumTreeSize += numNodes;
    }
    return enumTreeSize;
  }

  Enumerate.prototype.exit = function(s, retval) {
    if (isFinite(this.maxEnumTreeSize)) {
      // under default infer mode, might exit earlier here
      if (this.firstPath) {
        this.firstPath = false;
        var estimatedTreeSize = estimateEnumTreeSize(this.levelSizes);
        if (estimatedTreeSize > this.maxEnumTreeSize) {
          // exit if estimated enumeration tree size is above threshold
          return this.error(estimatedTreeSize + ' computations ahead.');
        }
      }
    }
    // We have reached an exit of the computation. Accumulate probability into retval bin.
    this.marginal.add(retval, this.score);

    // Increment the completed execution counter
    this.numCompletedExecutions += 1;

    // If anything is left in queue do it:
    if (this.queue.size() > 0 && (this.numCompletedExecutions < this.maxExecutions)) {
      return this.nextInQueue();
    } else {
      if (this.marginal.size === 0) {
        return this.error('All paths explored by Enumerate have probability zero.');
      }
      // Reinstate previous coroutine:
      env.coroutine = this.oldCoroutine;
      // Return from enumeration by calling original continuation with original store:
      return this.k(this.store, this.marginal.toDist());
    }
  };

  Enumerate.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  var strategies = {
    'likelyFirst': {
      makeQ: function() {
        return new PriorityQueue(function(a, b) {
          return a.score - b.score;
        });
      }
    },
    'depthFirst': {
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
    'breadthFirst': {
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
    return strategies[_.isFinite(maxExecutions) ? 'likelyFirst' : 'depthFirst'];
  }

  return {
    Enumerate: function(s, k, a, wpplFn, options) {
      return new Enumerate(s, k, a, wpplFn, options).run();
    }
  };

};
