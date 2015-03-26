////////////////////////////////////////////////////////////////////
// Incrementalized (i.e. caching) Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');

module.exports = function(env) {

  // A cached ERP call
  function ERPNode(coroutine, parent, s, k, a, erp, params, val, score) {
    this.coroutine = coroutine;

    this.store = _.clone(s);
    this.continuation = k;
    this.address = a;
    this.erp = erp;

    this.parent = parent;

    this.reachable = true;
    this.needsUpdate = false;

    this.params = params;
    this.val = (val !== undefined) ? val : erp.sample(params);
    this.score = (score !== undefined) ? score : erp.score(this.params, this.val);

    // Add this to the master list of ERP nodes
    this.coroutine.trace.erpNodes.push(this);
    var iscopy = val !== undefined;
    if (!iscopy)
      this.coroutine.newVarScore += this.score;
  }

  // Careful with how this adds to coroutine.trace.erpNodes (i.e. the contents
  //    of erpNodes should be copied and saved somewhere before this
  //    function gets invoked).
  ERPNode.prototype.clone = function(cloneparent) {
    return new ERPNode(this.coroutine, cloneparent, this.store,
                       this.continuation, this.address, this.erp,
                       this.params, this.val, this.score);
  };

  ERPNode.prototype.execute = function() {
    this.parent.notifyChildExecuted(this);
    if (this.needsUpdate) {
      this.needsUpdate = false;
      this.score = this.erp.score(this.params, this.val);
      this.parent.notifyChildChanged(this);
    }
    return this.kontinue();
  };

  ERPNode.prototype.registerInputChanges = function(s, k, params) {
    this.store = _.clone(s);
    this.continuation = k;
    this.reachable = true;
    this.needsUpdate = false;
    // Check params for changes
    for (var i = 0; i < params.length; i++)
    {
      if (params[i] !== this.params[i]) {
        this.needsUpdate = true;
        this.params = params;
        break;
      }
    }
  };

  ERPNode.prototype.kontinue = function() {
    // Call continuation
    return this.continuation(this.store, this.val);
  };

  ERPNode.prototype.markDead = function() {
    this.reachable = false;
    this.coroutine.oldVarScore += this.score;
  };

  ERPNode.prototype.propose = function() {
    this.store = _.clone(this.store);   // Not sure if this is really necessary...
    this.val = this.erp.sample(this.params);
    this.needsUpdate = true;
    return this.execute();
  };

  // ------------------------------------------------------------------

  // A cached factor call
  function FactorNode(coroutine, parent, s, k, a, unused, args) {
    this.coroutine = coroutine;

    this.store = _.clone(s);
    this.continuation = k;
    this.address = a;

    this.parent = parent;

    this.reachable = true;

    this.score = args[0];
  }

  FactorNode.prototype.clone = function(cloneparent) {
    return new FactorNode(this.coroutine, cloneparent, this.store,
                          this.continuation, this.address, null,
                          [this.score]);
  };

  FactorNode.prototype.execute = function() {
    this.parent.notifyChildExecuted(this);
    return this.kontinue();
  };

  FactorNode.prototype.registerInputChanges = function(s, k, args) {
    this.reachable = true;
    this.store = _.clone(s);
    this.continuation = k;
    this.score = args[0];
  };

  FactorNode.prototype.kontinue = function() {
    return this.continuation(this.store);
  };

  FactorNode.prototype.markDead = function() {
    this.reachable = false;
  }

  // ------------------------------------------------------------------

  // A cached, general WebPPL function call
  function FunctionNode(coroutine, parent, s, k, a, fn, args) {
    this.coroutine = coroutine;

    this.continuation = k;
    this.address = a;
    this.func = fn;

    this.parent = parent;
    this.children = [];
    this.nextChildToExecIdx = 0;

    this.reachable = true;
    this.needsUpdate = true;

    this.inStore = _.clone(s);
    this.args = args;

    this.retval = undefined;
    this.outStore = null;
    this.score = 0;
  }

  FunctionNode.prototype.clone = function(cloneparent) {
    var n = new FunctionNode(this.coroutine, cloneparent, this.inStore,
                             this.continuation, this.address, this.func,
                             this.args);
    n.retval = this.retval;
    n.outStore = this.outStore;
    n.score = this.score;

    _.each(this.children, function(child) {
      n.children.push(child.clone(n));
    });

    return n;
  };

  FunctionNode.prototype.execute = function() {
    if (this.parent !== null)
      this.parent.notifyChildExecuted(this);
    if (this.needsUpdate) {
      this.needsUpdate = false;
      // Keep track of program stack
      this.coroutine.nodeStack.push(this);
      // Reset nextChildToExecIdx
      this.nextChildToExecIdx = 0;
      // Preserve reference to coroutine object so
      //    continuation can refer to it.
      var coroutine = this.coroutine;
      return this.func.apply(global, [
        this.inStore,
        function(s, retval) {
          // Recover a reference to 'this'
          // (This is not safe to do through closure (i.e. var that = this above)
          //    because we clone the cache, producing different node objects).
          var that = coroutine.nodeStack.pop();
          that.outStore = _.clone(s);
          that.retval = retval;
          if (that.parent !== null)
            that.parent.notifyChildChanged(that);
          return that.kontinue();
        },
        this.address
      ].concat(this.args));
    } else {
      return this.kontinue();
    }
  };

  FunctionNode.prototype.registerInputChanges = function(s, k, args) {
    this.reachable = true;
    this.needsUpdate = false;
    this.continuation = k;
    // Check args for changes
    for (var i = 0; i < args.length; i++)
    {
      if (args[i] !== this.args[i]) {
        this.needsUpdate = true;
        this.args = args;
        break;
      }
    }
    // Check store for changes
    if (!this.needsUpdate) {
      for (var prop in s) {
        if (this.inStore[prop] !== s[prop]) {
          this.needsUpdate = true;
          this.inStore = _.clone(s);
          break;
        }
      }
    }
  };

  FunctionNode.prototype.markDead = function() {
    this.reachable = false;
    _.each(this.children, function(child) {
      child.markDead();
    });
  };

  FunctionNode.prototype.kontinue = function() {
    // Clear out any children that have become unreachable
    //    before passing control back up to the parent
    this.children = _.filter(this.children, function(child) {
      // If the child is unreachable, recursively set all of its
      //    descendants to unreachable, so that any ERPs get marked
      //    unreachable and we know to remove them from the master list.
      if (!child.reachable)
        child.markDead();
      return child.reachable;
    });
    // Accumulate scores from all reachable children
    this.score = 0;
    for (var i = 0; i < this.children.length; i++)
      this.score += this.children[i].score;
    // Call continuation
    return this.continuation(this.outStore, this.retval);
  };

  FunctionNode.prototype.notifyChildExecuted = function(child) {
    var idx = this.children.indexOf(child);
    this.nextChildToExecIdx = idx + 1;
  };

  FunctionNode.prototype.notifyChildChanged = function(child) {
    var idx = this.children.indexOf(child);
    // Children later in the execution order may become unreachable due
    //    to this change, so we mark them all as unreachable and see which
    //    ones we hit.
    for (var i = idx + 1; i < this.children.length; i++)
      this.children[i].reachable = false;
  };

  // ------------------------------------------------------------------

  function IncrementalMH(s, k, a, wpplFn, numIterations) {

    this.trace = {
      cacheRoot: null,
      erpNodes: []
    };
    this.backupTrace = null;
    this.newVarScore = 0;
    this.oldVarScore = 0;
    this.nodeStack = [];

    this.returnHist = {};
    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  IncrementalMH.prototype.run = function() {
    // Cache the top-level function, so that we always have a valid
    //    cache root.
    return this.incrementalize(this.s, env.exit, this.a, this.wpplFn);
  };

  IncrementalMH.prototype.factor = function(s, k, a, score) {
    return this.cachelookup(FactorNode, s, k, a, null, [score]).execute();
  };

  IncrementalMH.prototype.sample = function(s, cont, name, erp, params) {
    return this.cachelookup(ERPNode, s, cont, name, erp, params).execute();
  };

  function acceptProb(currTrace, oldTrace, oldVarScore, newVarScore) {
    if (!oldTrace || oldTrace.cacheRoot.score === -Infinity) { return 1; } // init
    var fw = -Math.log(oldTrace.erpNodes.length) + newVarScore;
    var bw = -Math.log(currTrace.erpNodes.length) + oldVarScore;
    var p = Math.exp(currTrace.cacheRoot.score - oldTrace.cacheRoot.score + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  IncrementalMH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      this.iterations--;

      this.trace.val = val;

      // Remove any erpNodes that have become unreachable.
      this.trace.erpNodes = _.filter(this.trace.erpNodes, function(node) {
        return node.reachable;
      });

      // Accept/reject the current proposal
      var acceptance = acceptProb(this.trace, this.backupTrace,
                                  this.oldVarScore, this.newVarScore);
      // Restore backup trace if rejected
      if (Math.random() >= acceptance)
        this.trace = this.backupTrace;

      // Add val to accumulated histogram
      var stringifiedVal = JSON.stringify(this.trace.val);
      if (this.returnHist[stringifiedVal] === undefined) {
        this.returnHist[stringifiedVal] = { prob: 0, val: this.trace.val };
      }
      this.returnHist[stringifiedVal].prob += 1;

      // Prepare to make a new proposal
      // Copy trace
      this.oldVarScore = 0;
      this.newVarScore = 0;
      this.backupTrace = this.trace;
      this.trace = {
        erpNodes: []
      };
      this.trace.cacheRoot = this.backupTrace.cacheRoot.clone(null);
      // Select ERP to change.
      var idx = Math.floor(Math.random() * this.trace.erpNodes.length);
      var propnode = this.trace.erpNodes[idx];
      // Restore node stack up to this point
      this.restoreStackUpTo(propnode.parent);
      // Propose change and resume execution
      return propnode.propose();
    } else {
      // Finalize returned histogram-based ERP
      var dist = erp.makeMarginalERP(this.returnHist);

      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;

      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  IncrementalMH.prototype.incrementalize = function(s, k, a, fn) {
    var args = Array.prototype.slice.call(arguments, 4);
    return this.cachelookup(FunctionNode, s, k, a, fn, args).execute();
  };

  // Returns a cache node
  IncrementalMH.prototype.cachelookup = function(NodeType, s, k, a, fn, args) {
    var cacheNode;
    // If the cache is empty, then initialize it.
    if (this.trace.cacheRoot === null) {
      cacheNode = new NodeType(this, null, s, k, a, fn, args);
      this.trace.cacheRoot = cacheNode;
    } else {
      var currNode = this.nodeStack[this.nodeStack.length-1];
      // Look for cache node among the children of currNode
      cacheNode = _.find(currNode.children, function(node) {
        return a == node.address;
      });
      if (cacheNode) {
        // Lookup successful; check for changes to store/args and move on.
        cacheNode.registerInputChanges(s, k, args);
      } else {
        // Lookup failed; create new node and insert it into currNode.children
        cacheNode = new NodeType(this, currNode, s, k, a, fn, args);
        var insertidx = currNode.nextChildToExecIdx;
        currNode.children.splice(insertidx, 0, cacheNode);
      }
    }
    return cacheNode;
  };

  // Restore this.nodeStack up to the specified node
  IncrementalMH.prototype.restoreStackUpTo = function(node) {
    this.nodeStack = [];
    while (node !== null) {
      this.nodeStack.push(node);
      node = node.parent;
    }
    this.nodeStack.reverse();
  };

  // ------------------------------------------------------------------

  function imh(s, cc, a, wpplFn, numIters) {
    return new IncrementalMH(s, cc, a, wpplFn, numIters).run();
  }

  return {
    IncrementalMH: imh
  };

};
