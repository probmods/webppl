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
      maxExecutions: Infinity
    });

    this.probe = options.probe;
    this.first_trace = true;
    this.level_sizes = []
    this.counter = 1

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
    if (this.probe) {
      this.counter += 1;
    }
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
      if (env.coroutine.probe) {
        return;
      }
      console.error(dist);
      throw new Error('Enumerate can only be used with distributions that have finite support.');
    }
    var supp = dist.support();

    // Check that support is non-empty
    if (supp.length === 0) {
      console.error(dist);
      throw new Error('Enumerate encountered a distribution with empty support!');
    }

    return supp;
  };

  Enumerate.prototype.sample = function(store, k, a, dist) {
    // console.log('sample')
    var support = getSupport(dist);
    if (!support) {
      return this.exit();
    }
    if (this.probe && this.first_trace) {
      this.level_sizes.push(support.length)
    }
    // For each value in support, add the continuation paired with
    // support value and score to queue:
    _.each(support, function(value) {
      this.enqueueContinuation(
          k, value, this.score + dist.score(value), store);
    }.bind(this));

    // Call the next state on the queue
    return this.nextInQueue();
  };

  Enumerate.prototype.factor = function(s, k, a, score) {
    // Update score and continue
    // console.log('factor')
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

  var getComplexity = function(sizes) {
    var num_nodes = 1;
    var num_evals = 1;
    var num_levels = sizes.length;
    for (var i in sizes) {
        num_nodes *= sizes[i];
        num_evals += num_nodes;
    }
    return num_evals
  }

  Enumerate.prototype.exit = function(s, retval) {
    // console.log(this.level_sizes)
    if (this.probe && this.first_trace){
      if (this.level_sizes.length < 1) {
        console.log('sampling from continuous distribution...quit Enumerate')
        return this.k(this.store, -1);
      }
      this.first_trace = false;
      var complexity = getComplexity(this.level_sizes)
      if (complexity > this.probe) {
        console.log(complexity + ' operations' + '...quit Enumerate')
        return this.k(this.store, complexity);
      }
    }
    // We have reached an exit of the computation. Accumulate probability into retval bin.
    this.marginal.add(retval, this.score);

    // Increment the completed execution counter
    this.numCompletedExecutions += 1;

    // If anything is left in queue do it:
    if (this.queue.size() > 0 && (this.numCompletedExecutions < this.maxExecutions)) {
      // console.log('exit1->next')
      return this.nextInQueue();
    } else {
      // console.log('exit2')
      if (this.marginal.size === 0) {
        throw new Error('All paths explored by Enumerate have probability zero.');
      }
      // Reinstate previous coroutine:
      env.coroutine = this.coroutine;
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
