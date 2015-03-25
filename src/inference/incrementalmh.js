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
    this.val = val || erp.sample(params);
    this.score = score || this.erp.score(this.params, this.val);

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
    if (this.parent !== null)
      this.parent.notifyChildExecuted(this);
    if (this.needsUpdate)
      this.score = this.erp.score(this.params, this.val);
    return this.kontinue();
  };

  ERPNode.prototype.registerInputChanges = function(s, params) {
    this.store = _.clone(s);
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
    this.score = this.erp.score(this.params, this.val);
    this.coroutine.currNode = this.parent;
    return this.kontinue();
  };

  // ------------------------------------------------------------------


  // A cached, general WebPPL function call
  function CacheNode(coroutine, parent, s, k, a, fn, args) {
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

  CacheNode.prototype.clone = function(cloneparent) {
    var n = new CacheNode(this.coroutine, cloneparent, this.inStore,
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

  CacheNode.prototype.execute = function() {
    if (this.parent !== null)
      this.parent.notifyChildExecuted(this);
    if (this.needsUpdate) {
      this.needsUpdate = false;
      // Keep track of the currently-executing node
      var oldCurrNode = this.coroutine.currNode;
      this.coroutine.currNode = this;
      // Reset nextChildToExecIdx
      this.nextChildToExecIdx = 0;
      // Reset score
      this.score = 0;
      var that = this;
      return this.func.apply(global, [
        this.inStore,
        function(s, retval) {
          that.outStore = _.clone(s);
          that.retval = retval;
          // Restore the previous currently-executing node
          that.coroutine.currNode = oldCurrNode;
          // The 'parent === null' case will correspond to the
          //    program root, in which case calling the continuation
          //    will invoke exit().
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

  CacheNode.prototype.registerInputChanges = function(s, args) {
    this.reachable = true;
    this.needsUpdate = false;
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

  CacheNode.prototype.markDead = function() {
    this.reachable = false;
    _.each(this.children, function(child) {
      child.markDead();
    });
  };

  CacheNode.prototype.kontinue = function() {
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
    for (var i = 0; i < this.children.length; i++)
      this.score += this.children[i].score;
    // Call continuation
    return this.continuation(this.outStore, this.retval);
  };

  CacheNode.prototype.notifyChildExecuted = function(child) {
    var idx = this.children.indexOf(child);
    this.nextChildToExecIdx = idx + 1;
  };

  CacheNode.prototype.notifyChildChanged = function(child) {
    var idx = this.children.indexOf(child);
    // Children later in the execution order may become unreachable due
    //    to this change, so we mark them all as unreachable and see which
    //    ones we hit.
    for (var i = idx+1; i < this.children.length; i++)
      this.children[i].reachable = false;
  };

  // ------------------------------------------------------------------

  function IncrementalMH(s, k, a, wpplFn, numIterations) {

    this.trace = {
      cacheRoot: null,
      erpNodes: [],
      score: 0,
      val: undefined
    };
    this.backupTrace = null;
    this.newVarScore = 0;
    this.oldVarScore = 0;
    this.currNode = null;

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
    return this.cache(this.s, env.exit, this.a, this.wpplFn);
    // return this.wpplFn(this.s, env.exit, this.a);
  };

  IncrementalMH.prototype.factor = function(s, k, a, score) {
    // If this.currNode is null (i.e. if we have some top part of the
    //    program that runs without caching), then we add directly to
    //    this.score.
    if (this.currNode === null)
      this.trace.score += score;
    else
      this.currNode.score += score;
  };

  IncrementalMH.prototype.sample = function(s, cont, name, erp, params) {
    return this.cachelookup(true, s, cont, name, erp, params).execute();
  };

  function acceptProb(currTrace, oldTrace, oldVarScore, newVarScore) {
    if (!oldTrace || oldTrace.score === -Infinity) { return 1; } // init
    var fw = -Math.log(oldTrace.erpNodes.length) + newVarScore;
    var bw = -Math.log(currTrace.erpNodes.length) + oldVarScore;
    var p = Math.exp(currTrace.score - oldTrace.score + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  IncrementalMH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      this.iterations -= 1;

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
      var stringifiedVal = JSON.stringify(val);
      if (this.returnHist[stringifiedVal] === undefined) {
        this.returnHist[stringifiedVal] = { prob: 0, val: val };
      }
      this.returnHist[stringifiedVal].prob += 1;

      // Make a new proposal (copy trace, etc.)
      this.oldVarScore = 0;
      this.newVarScore = 0;
      this.backupTrace = this.trace;
      this.trace = {
        erpNodes: [],
        score: 0,
        val: undefined
      };
      this.trace.cacheRoot = this.backupTrace.cacheRoot.clone(null);
      var idx = Math.floor(Math.random() * this.trace.erpNodes.length);
      return this.trace.erpNodes[idx].propose();
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

  IncrementalMH.prototype.cache = function(s, k, a, fn) {
    var args = Array.prototype.slice.call(arguments, 4);
    return this.cachelookup(false, s, k, a, fn, args).execute();
  };

  // Returns a CacheNode (or an ERPNode)
  IncrementalMH.prototype.cachelookup = function(isERP, s, k, a, fn, args) {
    var NodeType = isERP ? ERPNode : CacheNode;
    var cacheNode;
    // If the cache is empty, then initialize it.
    if (this.trace.cacheRoot === null) {
      cacheNode = new NodeType(this, null, s, k, a, fn, args);
      this.trace.cacheRoot = cacheNode;
    } else {
      // Look for cache node among the children of this.currNode
      cacheNode = _.find(this.currNode.children, function(node) {
        return a == node.address;
      });
      if (cacheNode) {
        // Lookup successful; check for changes to store/args and move on.
        cacheNode.registerInputChanges(s, args);
      } else {
        // Lookup failed; create new node and insert it into this.currNode.children
        cacheNode = new NodeType(this, this.currNode, s, k, a, fn, args);
        var insertidx = this.currNode.nextChildToExecIdx;
        this.currNode.children.splice(insertidx, 0, cacheNode);
      }
    }
    return cacheNode;
  };

  // ------------------------------------------------------------------

  function imh(s, cc, a, wpplFn, numIters) {
    return new IncrementalMH(s, cc, a, wpplFn, numIters).run();
  }

  return {
    IncrementalMH: imh
  };

};
