////////////////////////////////////////////////////////////////////
// Incrementalized (i.e. caching) Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');
var Hashtable = require('../hashtable.js').Hashtable
var Query = require('../query.js').Query;

module.exports = function(env) {

  // ------------------------------------------------------------------

  // Debugging output

  var DEBUG = 0;
  function debuglog(debuglevel) {
    if (DEBUG >= debuglevel) {
      var args = Array.prototype.slice.call(arguments, 1);
      console.log.apply(console, args);
    }
  }

  function tabbedlog(debuglevel, depth) {
    if (DEBUG >= debuglevel) {
      var args = Array.prototype.slice.call(arguments, 2);
      var pad = '';
      for (var i = 0; i < depth; i++) pad += '  ';
      pad += '[' + depth + '] ';
      console.log.apply(console, [pad].concat(args));
    }
  }

  // ------------------------------------------------------------------

  // A sort of 'copy on write' system for cache nodes

  function touch(node) {
    if (!node.__snapshot) {
      node.coroutine.touch(node);
      node.__snapshot = { reachable: true };
    }
  }

  function updateProperty(node, prop, val) {
    touch(node);
    if (!node.__snapshot[prop])
      node.__snapshot[prop] = node[prop];
    node[prop] = val;
  }

  function hasSnapshotForProperty(node, prop) {
    return node.__snapshot !== undefined &&
           node.__snapshot[prop] !== undefined;
  }

  function restoreSnapshot(node) {
    for (var prop in node.__snapshot) {
      node[prop] = node.__snapshot[prop];
    }
    node.__snapshot = undefined;
  }

  function discardSnapshot(node) {
    node.__snapshot = undefined;
  }

  // ------------------------------------------------------------------

  // A cached ERP call
  function ERPNode(coroutine, parent, s, k, a, erp, params) {
    this.coroutine = coroutine;

    this.store = _.clone(s);
    this.continuation = k;
    this.address = a;
    this.erp = erp;

    this.parent = parent;
    this.depth = parent.depth + 1;
    this.index = parent.nextChildIdx;

    this.reachable = true;
    this.needsUpdate = false;

    this.params = params;
    this.val = erp.sample(params);
    this.score = 0; this.rescore();

    // Add this to the master list of ERP nodes
    this.coroutine.addERP(this);
  }

  ERPNode.prototype.print = function() {
    // tabbedlog(0, this.depth, "ERPNode", this.address, this.erp.sample.name.slice(0, -6),
    //           this.params, this.val, this.reachable ? "" : "!!UNREACHABLE!!");
    tabbedlog(0, this.depth, 'ERPNode', this.erp.sample.name.slice(0, -6),
              this.params, this.val, this.reachable ? '' : '!!UNREACHABLE!!');
  };

  ERPNode.prototype.execute = function() {
    tabbedlog(4, this.depth, 'execute ERP');
    if (this.needsUpdate) {
      tabbedlog(4, this.depth, 'yes, ERP params changed');
      tabbedlog(5, this.depth, 'old params:',
          this.__snapshot ? this.__snapshot.params : undefined,
          'new params:', this.params);
      this.needsUpdate = false;
      this.rescore();
    }
    else {
      tabbedlog(4, this.depth, 'no, ERP params have not changed');
      tabbedlog(5, this.depth, 'params:', this.params);
    }
    return this.kontinue();
  };

  ERPNode.prototype.registerInputChanges = function(s, k, unused, params) {
    updateProperty(this, 'store', _.clone(s));
    updateProperty(this, 'continuation', k);
    updateProperty(this, 'index', this.parent.nextChildIdx);
    this.reachable = true;
    // Check params for changes
    for (var i = 0; i < params.length; i++)
    {
      if (params[i] !== this.params[i]) {
        this.needsUpdate = true;
        updateProperty(this, 'params', params);
        break;
      }
    }
  };

  ERPNode.prototype.kontinue = function() {
    this.parent.notifyChildExecuted(this);
    // Call continuation
    // Copies store, so that we maintain a pristine copy of this.store
    return this.continuation(_.clone(this.store), this.val);
  };

  ERPNode.prototype.killDescendantLeaves = function() {
    this.coroutine.removeERP(this);
  };

  ERPNode.prototype.propose = function() {
    var oldval = this.val;
    var newval = this.erp.sample(this.params);
    tabbedlog(4, this.depth, 'proposing change to ERP.', 'oldval:', oldval, 'newval:', newval);
    // If the value didn't change, then just bail out (we know the
    //    the proposal will be accepted)
    if (oldval === newval) {
      tabbedlog(4, this.depth, "proposal didn't change value; bailing out early");
      tabbedlog(5, this.depth, 'value:', this.val);
      return this.coroutine.exit();
    } else {
      updateProperty(this, 'store', _.clone(this.store));
      updateProperty(this, 'val', newval);
      var oldscore = this.score;
      this.rescore();
      this.coroutine.rvsPropLP = oldscore;
      this.coroutine.fwdPropLP = this.score;
      tabbedlog(1, this.depth, 'initial rvsPropLP:', this.coroutine.rvsPropLP,
          'initial fwdPropLP:', this.coroutine.fwdPropLP);
      this.needsUpdate = false;
      if (this.coroutine.doFullRerun) {
        // Mark every node above this one as needing update, then re-run
        //    the program from the start
        for (var node = this.parent; node !== null; node = node.parent)
          node.needsUpdate = true;
        return this.coroutine.runFromStart();
      } else {
        this.parent.notifyChildChanged(this);
        // Restore node stack up to this point
        this.coroutine.restoreStackUpTo(this.parent);
        return this.execute();
      }
    }
  };

  ERPNode.prototype.rescore = function() {
    var oldscore = this.score;
    updateProperty(this, 'score', this.erp.score(this.params, this.val));
    this.coroutine.score += this.score - oldscore;
    if (this.score === -Infinity) {
      tabbedlog(4, this.depth, 'score became -Infinity; bailing out early');
      return this.coroutine.exit();
    }
  };

  // ------------------------------------------------------------------

  // A cached factor call
  function FactorNode(coroutine, parent, s, k, a, unused, args) {
    this.coroutine = coroutine;

    this.store = s;
    this.continuation = k;
    this.address = a;

    this.parent = parent;
    this.depth = parent.depth + 1;
    this.index = parent.nextChildIdx;

    this.reachable = true;

    this.rescore(0, args[0]);

    tabbedlog(3, this.depth, 'new factor');
  }

  FactorNode.prototype.print = function() {
    // tabbedlog(0, this.depth, "FactorNode", this.address, this.reachable ? "" : "!!UNREACHABLE!!");
    tabbedlog(0, this.depth, 'FactorNode', this.reachable ? '' : '!!UNREACHABLE!!');
  };

  FactorNode.prototype.execute = function() {
    // Bail out early if we know proposal will be rejected
    if (this.score === -Infinity) {
      tabbedlog(4, this.depth, 'score became -Infinity; bailing out early');
      return this.coroutine.exit();
    } else {
      return this.kontinue();
    }
  };

  FactorNode.prototype.registerInputChanges = function(s, k, unused, args) {
    updateProperty(this, 'store', s);
    updateProperty(this, 'continuation', k);
    updateProperty(this, 'index', this.parent.nextChildIdx);
    this.reachable = true;
    if (this.score !== args[0])
      this.rescore(this.score, args[0]);
  };

  FactorNode.prototype.kontinue = function() {
    this.parent.notifyChildExecuted(this);
    return this.continuation(this.store);
  };

  FactorNode.prototype.killDescendantLeaves = function() {
    tabbedlog(3, this.depth, 'kill factor', this.address);
    this.coroutine.score -= this.score;
  }

  FactorNode.prototype.rescore = function(oldscore, score) {
    updateProperty(this, 'score', score);
    this.coroutine.score += score - oldscore;
  };

  // ------------------------------------------------------------------

  // Comparing two stores for shallow equality
  function storesEqual(s1, s2) {
    var prop;
    for (prop in s1) {
      if (s1[prop] !== s2[prop])
        return false;
    }
    for (prop in s2) {
      if (s1[prop] !== s2[prop])
        return false;
    }
    return true;
  }

  // Checks whether two function are equivalent
  var fnEquivCache = {};
  function fnsEqual(f1, f2) {
    // If the two functions are literally the same closure, then of course
    //    they are equivalent.
    if (f1 === f2) return true;
    // Otherwise, they're equivalent if they come from the same source location
    //    and the values of the variables they close over are the same.
    // We cache this check, because situations often arise where we're checking
    //    the same pair of functions over and over again.
    if (f1.__lexid === f2.__lexid) {
      var key = JSON.stringify([f1.__uniqueid, f2.__uniqueid]);
      var val = fnEquivCache[key];
      if (val === undefined) {
        val = true;
        for (var i = 0; i < f1.__freeVarVals.length; i++) {
          var v1 = f1.__freeVarVals[i];
          var v2 = f2.__freeVarVals[i];
          // If they're both functions, recursively apply this check
          var eq = (_.isFunction(v1) && _.isFunction(v2)) ? fnsEqual(v1, v2) : v1 === v2;
          if (!eq) {
            val = false;
            break;
          }
        }
        fnEquivCache[key] = val;
      }
      return val;
    }
    return false;
  }

  // A cached, general WebPPL function call
  function FunctionNode(coroutine, parent, s, k, a, fn, args) {
    this.coroutine = coroutine;

    this.continuation = k;
    this.address = a;
    this.func = fn;

    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.index = parent ? parent.nextChildIdx : undefined;
    this.children = [];
    this.nextChildIdx = 0;

    this.reachable = true;
    this.needsUpdate = true;

    this.inStore = _.clone(s);
    this.args = args;

    this.initialized = false;
    this.retval = undefined;
    this.outStore = null;
  }

  FunctionNode.prototype.print = function() {
    // tabbedlog(0, this.depth, "FunctionNode", this.address, this.args, this.retval,
    //           this.reachable ? "" : "!!UNREACHABLE!!");
    tabbedlog(0, this.depth, 'FunctionNode', this.args, this.retval,
              this.reachable ? '' : '!!UNREACHABLE!!');
    for (var i = 0; i < this.children.length; i++)
      this.children[i].print();
  };

  FunctionNode.prototype.execute = function() {
    tabbedlog(4, this.depth, 'execute function');
    if (this.needsUpdate) {
      if (this.initialized)
        this.coroutine.cacheAdapter.registerMiss(this);
      tabbedlog(4, this.depth, 'yes, function args changed; executing');
      tabbedlog(5, this.depth, 'old args:', this.__snapshot ? this.__snapshot.args : undefined, 'new args:', this.args);
      this.needsUpdate = false;
      // Keep track of program stack
      this.coroutine.nodeStack.push(this);
      // Reset nextChildIdx
      this.nextChildIdx = 0;
      // Mark all children as unreachable; execution will then determine which
      //    ones are actually reachable
      var nchildren = this.children.length;
      for (var i = 0; i < nchildren; i++) {
        touch(this.children[i]);
        this.children[i].reachable = false;
      }
      tabbedlog(4, this.depth, 'Children marked unreachable on execute:', nchildren);
      // Preserve reference to coroutine object so
      //    continuation can refer to it.
      var coroutine = this.coroutine;
      // Also preserve references to this node's continuation and address.
      // We need these to bypass the cache 'on-exit' processing stuff and just
      //    invoke the original continuation if and when nodes with this address
      //    stop being cached (by the cache adapter).
      var continuation = this.continuation;
      var address = this.address;
      // Record the fact that we entered this function.
      this.entered = true;
      return this.func.apply(global, [
        this.inStore,
        function(s, retval) {
          // If we've stopped caching nodes with this address, just immediately continue
          if (!coroutine.cacheAdapter.shouldCache(address)) return continuation(s, retval);
          // Recover a reference to 'this'
          var that = coroutine.nodeStack.pop();
          tabbedlog(4, that.depth, 'continue from function');
          that.initialized = true;
          // Clear out any children that have become unreachable
          var newchildren = [];
          var nchildren = that.children.length;
          var ii = 0;
          for (var i = 0; i < nchildren; i++) {
            var child = that.children[i];
            if (!child.reachable)
              child.killDescendantLeaves();
            else {
              updateProperty(child, 'index', ii++);
              newchildren.push(child);
            }
          }
          updateProperty(that, 'children', newchildren);
          // If the return value and output store haven't changed, then we can bail early.
          // We can only do this if this call is returning from a change somewhere below it
          //    (i.e. that.entered == false). Otherwise, we need to keep running.
          if (!that.entered && that.retval === retval && storesEqual(that.outStore, s)) {
            tabbedlog(4, that.depth, 'bailing b/c function return val not changed');
            tabbedlog(5, that.depth, 'return val:', retval);
            coroutine.cacheAdapter.registerHit(that);
            return coroutine.exit();
          }
          if (!that.entered && that.parent !== null)
            that.parent.notifyChildChanged(that);
          if (!that.entered)
            coroutine.cacheAdapter.registerMiss(that);
          that.entered = false;
          tabbedlog(4, that.depth, 'function return val has changed, or cannot bail');
          tabbedlog(5, that.depth, 'old ret val:', that.retval, 'new ret val:', retval);
          // Update output values
          updateProperty(that, 'retval', retval);
          updateProperty(that, 'outStore', _.clone(s));
          // Continue execution
          return that.kontinue();
        },
        this.address
      ].concat(this.args));
    } else {
      this.coroutine.cacheAdapter.registerHit(this);
      tabbedlog(4, this.depth, 'no, function args have not changed; continuing');
      tabbedlog(5, this.depth, 'args:', this.args);
      return this.kontinue();
    }
  };

  FunctionNode.prototype.registerInputChanges = function(s, k, fn, args) {
    updateProperty(this, 'continuation', k);
    if (this.parent) updateProperty(this, 'index', this.parent.nextChildIdx);
    this.reachable = true;
    // Check fn for changes
    if (!fnsEqual(fn, this.func)) {
      this.needsUpdate = true;
      updateProperty(this, 'func', fn);
    }
    // Check args for changes
    if (this.args.length !== args.length) {
      this.needsUpdate = true;
      updateProperty(this, 'args', args);
    } else {
      var i = args.length;
      for (var i = 0; i < args.length; i++)
      {
        if (args[i] !== this.args[i]) {
          this.needsUpdate = true;
          updateProperty(this, 'args', args);
          break;
        }
      }
    }
    // Check store for changes
    if (!storesEqual(this.store, s)) {
      this.needsUpdate = true;
      updateProperty(this, 'inStore', _.clone(s));
    }
  };

  FunctionNode.prototype.killDescendantLeaves = function() {
    tabbedlog(3, this.depth, 'kill function (and all descendant leaves)', this.address);
    var stack = [this];
    while (stack.length > 0) {
      var node = stack.pop();
      if (node.score !== undefined) node.killDescendantLeaves();
      else {
        var n = node.children.length;
        while (n--) stack.push(node.children[n]);
      }
    }
  };

  FunctionNode.prototype.kontinue = function() {
    if (this.parent !== null)
      this.parent.notifyChildExecuted(this);
    // Call continuation
    // Copies outStore, so we maintain a pristine record of it.
    return this.continuation(_.clone(this.outStore), this.retval);
  };

  FunctionNode.prototype.notifyChildExecuted = function(child) {
    this.nextChildIdx = child.index + 1;
  };

  FunctionNode.prototype.notifyChildChanged = function(child) {
    // Children later in the execution order may become unreachable due
    //    to this change, so we mark them all as unreachable and see which
    //    ones we hit.
    var nchildren = this.children.length;
    var totalmarked = 0;
    for (var i = child.index + 1; i < nchildren; i++) {
      touch(this.children[i]);
      this.children[i].reachable = false;
      totalmarked++;
    }
    tabbedlog(4, this.depth, 'Children marked unreachable on child change:', totalmarked);
  };

  // Called by the cache adapter when it determines that this node isn't giving
  //    good enough cache efficiency and should be removed from the cache.
  FunctionNode.prototype.removeFromCache = function() {
    // First, verify that this node actually *is* in the cache (i.e. hasn't
    //    already been removed via rejection), otherwise the subsequent ops
    //    ops we perform will screw things up.
    if (this.parent.children[this.index] === this) {
      // Correct the various metadata on the children of this node.
      var n = this.children.length;
      for (var i = 0; i < n; i++) {
        var child = this.children[i];
        child.parent = this.parent;
        child.index = this.index + i;
        // Recursively adjust depth of all descendants
        var stack = [child];
        while (stack.length > 0) {
          var node = stack.pop();
          node.depth--;
          if (node.children) {
            var nn = node.children.length;
            while (nn--) stack.push(node.children[nn]);
          }
        }
      }
      // Correct the indices of the subsequent siblings of this node, to
      //    account for the children that are about to be moved up.
      for (var i = this.index + 1; i < this.parent.children.length; i++) {
        this.parent.children[i].index = i + n - 1;
      }
      // Remove this and move up this.children into this.parent.children
      this.children.unshift(this.index, 1);
      Array.prototype.splice.apply(this.parent.children, this.children);
    }
  }

  // ------------------------------------------------------------------

  // Abstraction representing a master list of ERPs
  // (lets us abstract over whether we're using an array or a hash table)

  function ArrayERPMasterList() {
    this.erpNodes = [];
  }

  ArrayERPMasterList.prototype.size = function() { return this.erpNodes.length; }
      ArrayERPMasterList.prototype.oldSize = function() {
    return this.oldErpNodes === undefined ? undefined : this.oldErpNodes.length;
  }

  ArrayERPMasterList.prototype.addERP = function(node) {
    this.erpNodes.push(node);
  };

  ArrayERPMasterList.prototype.removeERP = function(node) {
    // Set it up to be removed as a post-process
    touch(node);
    node.reachable = false;
  };

  ArrayERPMasterList.prototype.preProposal = function() {
    this.oldErpNodes = this.erpNodes.slice();
  };

  ArrayERPMasterList.prototype.postProposal = function() {
    this.erpNodes = _.filter(this.erpNodes, function(node) {
      return node.reachable;
    });
  };

  ArrayERPMasterList.prototype.getRandom = function() {
    var idx = Math.floor(Math.random() * this.erpNodes.length);
    return this.erpNodes[idx];
  };

  ArrayERPMasterList.prototype.restoreOnReject = function() {
    this.erpNodes = this.oldErpNodes;
  };


  function HashtableERPMasterList() {
    this.erpNodeMap = new Hashtable();
    this.erpsAdded = [];
    this.erpsRemoved = [];
    this.numErps = 0;
  }

  HashtableERPMasterList.prototype.size = function() { return this.numErps; }
      HashtableERPMasterList.prototype.oldSize = function() { return this.oldNumErps; }

      HashtableERPMasterList.prototype.addERP = function(node) {
    this.erpNodeMap.put(node.address, node);
    this.erpsAdded.push(node);
    this.numErps++;
    // this.checkConsistency("addERP");
  };

  HashtableERPMasterList.prototype.removeERP = function(node) {
    this.erpNodeMap.remove(node.address);
    this.erpsRemoved.push(node);
    this.numErps--;
    // this.checkConsistency("removeERP");
  };

  HashtableERPMasterList.prototype.preProposal = function() {
    this.oldNumErps = this.numErps;
    this.erpsAdded = [];
    this.erpsRemoved = [];
  };

  HashtableERPMasterList.prototype.postProposal = function() {};

  HashtableERPMasterList.prototype.getRandom = function() { return this.erpNodeMap.getRandom(); }

      HashtableERPMasterList.prototype.restoreOnReject = function() {
    // this.checkConsistency("restoreOnReject");
    this.numErps = this.oldNumErps;
    var n = this.erpsAdded.length;
    while (n--) {
      var node = this.erpsAdded[n];
      this.erpNodeMap.remove(node.address);
    }
    n = this.erpsRemoved.length;
    while (n--) {
      var node = this.erpsRemoved[n];
      this.erpNodeMap.put(node.address, node);
    }
  };

  // For debugging
  HashtableERPMasterList.prototype.checkConsistency = function(tag) {
    for (var i = 0; i < this.erpsAdded.length; i++) {
      var addr = this.erpsAdded[i].address;
      if (!this.erpNodeMap.get(addr))
        throw "WTF - hash table doesn't contain node " + addr + ' that we added (' + tag + ')';
    }
    for (var i = 0; i < this.erpsRemoved.length; i++) {
      var addr = this.erpsRemoved[i].address;
      if (this.erpNodeMap.get(addr))
        throw 'WTF - hash table contains node ' + addr + ' that we removed (' + tag + ')';
    }
  };

  // ------------------------------------------------------------------

  // Tracks statistics on how the cache is performing, so we can make
  //    decisions about when to stop caching certain functions
  function CacheAdapter(minHitRate, fuseLength, iterFuseLength) {
    this.minHitRate = minHitRate;
    this.fuseLength = fuseLength;
    this.iterFuseLength = iterFuseLength;
    this.addrToId = {};
    this.stats = {};
    this.idsToRemove = {};
    this.hasIdsToRemove = false;
  }

  CacheAdapter.prototype.id = function(addr) {
    var id = this.addrToId[addr];
    if (id === undefined) {
      var arr = addr.split('_');
      id = arr[arr.length - 1];
      this.addrToId[addr] = id;
    }
    return id;
  }

  CacheAdapter.prototype.getStats = function(addr) {
    var id = this.id(addr);
    var stats = this.stats[id];
    if (stats === undefined) {
      stats = {shouldCache: true, hits: 0, total: 0};
      this.stats[id] = stats;
    }
    return stats;
  }

  CacheAdapter.prototype.shouldCache = function(addr) {
    return this.getStats(addr).shouldCache;
  };

  CacheAdapter.prototype.registerHit = function(node) {
    var stats = this.getStats(node.address);
    stats.hits++;
    stats.total++;
    if (node.parent !== null &&   // Can't remove the cache root
        (node.coroutine.totalIterations - node.coroutine.iterations) > this.iterFuseLength &&
        stats.total >= this.fuseLength && stats.hits / stats.total < this.minHitRate) {
      this.idsToRemove[this.id(node.address)] = true;
      this.hasIdsToRemove = true;
    }
  };

  CacheAdapter.prototype.registerMiss = function(node) {
    var stats = this.getStats(node.address);
    stats.total++;
    if (node.parent !== null &&   // Can't remove the cache root
        (node.coroutine.totalIterations - node.coroutine.iterations) > this.iterFuseLength &&
        stats.total >= this.fuseLength && stats.hits / stats.total < this.minHitRate) {
      this.idsToRemove[this.id(node.address)] = true;
      this.hasIdsToRemove = true;
    }
  }

  CacheAdapter.prototype.adapt = function(cacheRoot) {
    if (this.hasIdsToRemove) {
      for (var id in this.idsToRemove) {
        var s = this.stats[id];
        debuglog(5, 'Cache adapter removing nodes w/ id', id, 'hit rate:', s.hits / s.total);
        this.stats[id].shouldCache = false;
      }
      // Traverse cache and remove all nodes with this id
      var stack = [cacheRoot];
      while (stack.length > 0) {
        var node = stack.pop();
        if (node.children !== undefined) {
          var n = node.children.length;
          while (n--) stack.push(node.children[n]);
        }
        if (this.idsToRemove[this.id(node.address)])
          node.removeFromCache();
      }
      this.idsToRemove = {};
      this.hasIdsToRemove = false;
      if (DEBUG >= 6) {
        debuglog(6, '=== Post-adaptation cache status ===');
        cacheRoot.print();
      }
    }
  };

  CacheAdapter.prototype.report = function() {
    for (var id in this.stats) {
      console.log(id, ':', this.stats[id]);
    }
  };

  // ------------------------------------------------------------------

  function IncrementalMH(s, k, a, wpplFn, numIterations, opts) {
    // Extract options
    var dontAdapt = opts.dontAdapt === undefined ? false : opts.dontAdapt;
    var debuglevel = opts.debuglevel === undefined ? 0 : opts.debuglevel;
    var verbose = opts.verbose === undefined ? false : opts.verbose;
    var justSample = opts.justSample === undefined ? false : opts.justSample;
    var doFullRerun = opts.doFullRerun === undefined ? false : opts.doFullRerun;
    var onlyMAP = opts.onlyMAP === undefined ? false : opts.onlyMAP;
    var minHitRate = opts.cacheMinHitRate === undefined ? 0.00000001 : opts.cacheMinHitRate;
    var fuseLength = opts.cacheFuseLength === undefined ? 50 : opts.cacheFuseLength;
    var lag = opts.lag === undefined ? 1 : opts.lag;
    var iterFuseLength = opts.cacheIterFuseLength === undefined ? 10 : opts.cacheIterFuseLength;

    // Doing a full re-run doesn't really jive with the heuristic we use for adaptive
    //    caching, so disable adaptation in this case.
    if (doFullRerun)
      dontAdapt = true;

    DEBUG = debuglevel;
    this.verbose = verbose;

    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.onlyMAP = onlyMAP;
    if (justSample)
      this.returnSamps = [];
    else
      this.returnHist = {};
    this.MAP = { val: undefined, score: -Infinity };
    this.totalIterations = numIterations;
    this.acceptedProps = 0;
    this.lag = lag;

    this.doFullRerun = doFullRerun;

    this.doAdapt = !dontAdapt;
    this.cacheAdapter = new CacheAdapter(minHitRate, fuseLength, iterFuseLength);

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  IncrementalMH.prototype.run = function() {
    this.cacheRoot = null;
    this.erpMasterList = new HashtableERPMasterList();
    // this.erpMasterList = new ArrayERPMasterList();
    this.touchedNodes = [];
    this.score = 0;
    this.fwdPropLP = 0;
    this.rvsPropLP = 0;
    this.query = new Query();
    env.query.clear();
    debuglog(1, '-------------------------------------');
    debuglog(1, 'RUN FROM START');
    return this.runFromStart();
  };

  IncrementalMH.prototype.runFromStart = function() {
    this.nodeStack = [];
    // Cache the top-level function, so that we always have a valid
    //    cache root.
    return this.incrementalize(this.s, env.exit, this.a, this.wpplFn, []);
  };

  IncrementalMH.prototype.factor = function(s, k, a, score) {
    return this.cachelookup(FactorNode, s, k, a, null, [score]).execute();
  };

  IncrementalMH.prototype.sample = function(s, k, a, erp, params, name) {
    var n = this.cachelookup(ERPNode, s, k, a, erp, params);
    n.name = name;
    return n.execute();
  };

  // A node should call this on itself if it makes some change to itself.
  IncrementalMH.prototype.touch = function(node) {
    this.touchedNodes.push(node);
  };

  function acceptProb(currScore, oldScore, currN, oldN, rvsPropLP, fwdPropLP) {
    if (oldScore === undefined) { return 1; } // init
    if (currScore === -Infinity) return 0;  // auto-reject
    debuglog(1, 'currScore:', currScore, 'oldScore', oldScore);
    debuglog(1, 'rvsPropLP:', rvsPropLP, 'fwdPropLP:', fwdPropLP);
    var fw = -Math.log(oldN) + fwdPropLP;
    var bw = -Math.log(currN) + rvsPropLP;
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  // Returns true if we've successfully rejection initialized.
  IncrementalMH.prototype.isInitialized = function() {
    return this.iterations < this.totalIterations;
  }

  IncrementalMH.prototype.exit = function() {
    if (this.iterations > 0) {
      // Initialization: Keep rejection sampling until we get a trace with
      //    non-zero probability
      if (!this.isInitialized() && this.score === -Infinity) {
        return this.run();
      } else {
        debuglog(1, 'iteration', (this.totalIterations - this.iterations));
        if (this.verbose)
          console.log('IncrementalMH iteration ' + (this.totalIterations - this.iterations) +
              ' / ' + this.totalIterations);
        // Continue proposing as normal
        this.iterations--;

        this.erpMasterList.postProposal();

        debuglog(2, 'Num vars:', this.erpMasterList.size());
        debuglog(2, 'Touched nodes:', this.touchedNodes.length);

        // Accept/reject the current proposal
        var acceptance = acceptProb(this.score, this.oldScore,
                                    this.erpMasterList.size(), this.erpMasterList.oldSize(),
                                    this.rvsPropLP, this.fwdPropLP);
        debuglog(1, 'num vars:', this.erpMasterList.size(), 'old num vars:', this.erpMasterList.oldSize());
        debuglog(1, 'acceptance prob:', acceptance);
        if (Math.random() >= acceptance) {
          debuglog(1, 'REJECT');
          this.score = this.oldScore;
          var n = this.touchedNodes.length;
          while (n--) restoreSnapshot(this.touchedNodes[n]);
          this.erpMasterList.restoreOnReject();
        }
        else {
          debuglog(1, 'ACCEPT');
          var n = this.touchedNodes.length;
          while (n--) discardSnapshot(this.touchedNodes[n]);
          this.acceptedProps++;
          this.query.addAll(env.query);
        }
        env.query.clear();

        var val = this.cacheRoot.retval;
        debuglog(1, 'return val:', val);

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
          if (this.score > this.MAP.score) {
            this.MAP.score = this.score;
            this.MAP.value = val;
          }
        }

        if (DEBUG >= 6) {
          debuglog(6, '=== Cache status ===');
          this.cacheRoot.print();
        }

        // this.checkReachabilityConsistency();

        if (this.doAdapt)
          this.cacheAdapter.adapt(this.cacheRoot);

        // Prepare to make a new proposal
        this.oldScore = this.score;
        this.erpMasterList.preProposal();
        this.touchedNodes = [];
        this.fwdPropLP = 0;
        this.rvsPropLP = 0;
        // Select ERP to change.
        var propnode = this.erpMasterList.getRandom();
        // Propose change and resume execution
        debuglog(1, '----------------------------------------------------------------------');
        debuglog(1, 'PROPOSAL', 'type:', propnode.erp.sample.name, 'address:', propnode.address);
        return propnode.propose();
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

      if (DEBUG >= 5) {
        this.cacheAdapter.report();
      }

      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  IncrementalMH.prototype.incrementalize = function(s, k, a, fn, args) {
    if (this.cacheAdapter.shouldCache(a))
      return this.cachelookup(FunctionNode, s, k, a, fn, args).execute();
    else
      return env.defaultCoroutine.incrementalize(s, k, a, fn, args);
  };

  // Returns a cache node
  IncrementalMH.prototype.cachelookup = function(NodeType, s, k, a, fn, args) {
    var cacheNode;
    // If the cache is empty, then initialize it.
    if (this.cacheRoot === null) {
      cacheNode = new NodeType(this, null, s, k, a, fn, args);
      this.cacheRoot = cacheNode;
    // If the node stack is empty, then we must be looking up the root on a
    //    re-run from start
    } else if (this.nodeStack.length === 0) {
      if (a !== this.cacheRoot.address) throw 'Wrong address for cache root lookup';
      cacheNode = this.cacheRoot;
      cacheNode.registerInputChanges(s, k, fn, args);
    // Otherwise, do the general thing.
    } else {
      var currNode = this.nodeStack[this.nodeStack.length - 1];
      tabbedlog(3, currNode.depth, 'lookup', NodeType.name, a);
      // Look for cache node among the children of currNode
      cacheNode = this.findNode(currNode, a);
      if (cacheNode) {
        // Lookup successful; check for changes to store/args and move on.
        tabbedlog(3, currNode.depth, 'found');
        cacheNode.registerInputChanges(s, k, fn, args);
      } else {
        // Lookup failed; create new node and insert it into currNode.children
        if (DEBUG) {
          var addrs = _.map(_.filter(currNode.children, function(node) { return node instanceof NodeType; }),
              function(node) { return node.address; });
          tabbedlog(3, currNode.depth, '*not* found');
          tabbedlog(4, currNode.depth, 'options were', addrs);
        }
        cacheNode = new NodeType(this, currNode, s, k, a, fn, args);
        var insertidx = currNode.nextChildIdx;
        // Copy the children array if we don't already have a snapshot for it
        // Kind of annoying that this somewhat breaks the abstraction of snapshots, but
        //    I think it's worth it.
        if (!hasSnapshotForProperty(currNode, 'children'))
          updateProperty(currNode, 'children', currNode.children.slice());
        currNode.children.splice(insertidx, 0, cacheNode);
      }
    }
    return cacheNode;
  };

  IncrementalMH.prototype.findNode = function(parentNode, address) {
    // If we haven't initialized yet (i.e. we're running the program for
    //    the first time), then don't even bother looking.
    if (!this.isInitialized()) return undefined;
    // Need to snapshot the children array, since we perform swaps on it to keep nodes
    //    in execution order.
    var nodes = parentNode.children;
    var nexti = parentNode.nextChildIdx;
    for (var i = nexti; i < nodes.length; i++) {
      // for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].address === address) {
        // Keep nodes ordered according to execution order: if
        // i !== nexti, then swap those two.
        if (i !== nexti) {
          // if (i < nexti) throw "WTF - cache node found *before* first possible location";
          if (!hasSnapshotForProperty(parentNode, 'children')) {
            nodes = nodes.slice();
            updateProperty(parentNode, 'children', nodes);
          }
          var tmp = nodes[i];
          nodes[i] = nodes[nexti];
          nodes[nexti] = tmp;
        }
        return nodes[nexti];
      }
    }
  };

  IncrementalMH.prototype.addERP = function(node) {
    tabbedlog(3, node.depth, 'new ERP');
    this.erpMasterList.addERP(node);
    this.fwdPropLP += node.score;
  };

  IncrementalMH.prototype.removeERP = function(node) {
    tabbedlog(3, node.depth, 'kill ERP', node.address);
    this.erpMasterList.removeERP(node);
    this.rvsPropLP += node.score;
    this.score -= node.score;
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

  // For debugging purposes, mostly
  IncrementalMH.prototype.addressInCache = function(addr) {
    var stack = [this.cacheRoot];
    while (stack.length > 0) {
      var node = stack.pop();
      if (node.address === addr)
        return true;
      if (node.children !== undefined)
        for (var i = 0; i < node.children.length; i++)
          stack.push(node.children[i]);
    }
    return false;
  };

  // Also for debugging
  IncrementalMH.prototype.checkReachabilityConsistency = function() {
    var stack = [this.cacheRoot];
    while (stack.length > 0) {
      var node = stack.pop();
      if (!node.reachable) throw 'WTF - found unreachable node in cache.';
      if (node.children !== undefined)
        for (var i = 0; i < node.children.length; i++)
          stack.push(node.children[i]);
    }
    return false;
  };

  // ------------------------------------------------------------------

  function imh(s, cc, a, wpplFn, numIters, opts) {
    opts = opts || {};
    return new IncrementalMH(s, cc, a, wpplFn, numIters, opts).run();
  }

  return {
    IncrementalMH: imh
  };

};
