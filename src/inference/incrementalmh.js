////////////////////////////////////////////////////////////////////
// Incrementalized (i.e. caching) Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Hashtable = require('../hashtable').Hashtable
var Query = require('../query').Query;
var CountAggregator = require('../aggregation/CountAggregator');
var MaxAggregator = require('../aggregation/MaxAggregator');

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

  // A cached distribution call
  function DistNode(coroutine, parent, s, k, a, dist) {
    this.coroutine = coroutine;

    this.store = _.clone(s);
    this.continuation = k;
    this.address = a;
    this.dist = dist;

    this.parent = parent;
    this.depth = parent.depth + 1;
    this.index = parent.nextChildIdx;

    this.reachable = true;
    this.needsUpdate = false;

    this.val = dist.sample();
    this.score = 0; this.rescore();

    // Add this to the master list of distribution nodes
    this.coroutine.addDist(this);
  }

  DistNode.prototype.print = function() {
    tabbedlog(0, this.depth, 'DistNode', this.dist,
              this.val, this.reachable ? '' : '!!UNREACHABLE!!');
  };

  DistNode.prototype.execute = function() {
    tabbedlog(4, this.depth, 'execute distribution');
    if (this.needsUpdate) {
      tabbedlog(4, this.depth, 'yes, dist changed');
      tabbedlog(5, this.depth, 'old dist:',
          this.__snapshot ? this.__snapshot.dist : undefined,
          'new dist:', this.dist);
      this.needsUpdate = false;
      this.rescore();
    }
    else {
      tabbedlog(4, this.depth, 'no, dist has not changed');
      tabbedlog(5, this.depth, 'dist:', this.dist);
    }
    // Bail out early if we know proposal will be rejected
    if (this.score === -Infinity) {
      tabbedlog(4, this.depth, 'score became -Infinity; bailing out early');
      return this.coroutine.exit();
    } else {
      return this.kontinue();
    }
  };

  DistNode.prototype.registerInputChanges = function(s, k, dist) {
    updateProperty(this, 'store', _.clone(s));
    updateProperty(this, 'continuation', k);
    updateProperty(this, 'index', this.parent.nextChildIdx);
    this.reachable = true;
    if (!distEqual(dist, this.dist)) {
      this.needsUpdate = true;
      updateProperty(this, 'dist', dist);
    }
  };

  DistNode.prototype.kontinue = function() {
    this.parent.notifyChildExecuted(this);
    // Call continuation
    // Copies store, so that we maintain a pristine copy of this.store
    return this.continuation(_.clone(this.store), this.val);
  };

  DistNode.prototype.killDescendantLeaves = function() {
    this.coroutine.removeDist(this);
  };

  DistNode.prototype.propose = function() {
    var oldval = this.val;
    var fwdPropDist = this.dist.driftKernel ? this.dist.driftKernel(oldval) : this.dist;
    var newval = fwdPropDist.sample();
    tabbedlog(4, this.depth, 'proposing change to distribution.', 'oldval:', oldval, 'newval:', newval);
    // If the value didn't change, then just bail out (we know the
    //    the proposal will be accepted)
    if (oldval === newval) {
      tabbedlog(4, this.depth, "proposal didn't change value; bailing out early");
      tabbedlog(5, this.depth, 'value:', this.val);
      return this.coroutine.exit();
    } else {
      updateProperty(this, 'store', _.clone(this.store));
      updateProperty(this, 'val', newval);
      this.rescore();
      var rvsPropDist = this.dist.driftKernel ? this.dist.driftKernel(newval) : this.dist;
      this.coroutine.rvsPropLP = rvsPropDist.score(oldval);
      this.coroutine.fwdPropLP = fwdPropDist.score(newval);
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

  DistNode.prototype.rescore = function() {
    var oldscore = this.score;
    updateProperty(this, 'score', this.dist.score(this.val));
    this.coroutine.score += this.score - oldscore;
  };


  // This is used to decide whether to re-score a distribution. Only a
  // shallow check for parameter equality is performed, as a deep
  // check is unlikely to be any faster than re-scoring.
  function distEqual(dist1, dist2) {
    return dist1.constructor === dist2.constructor &&
        distParamsEqual(dist1.params, dist2.params);
  }

  function distParamsEqual(p1, p2) {
    if (p1 === p2) {
      return true;
    }
    //assert.strictEqual(_.size(p1), _.size(p2));
    for (var k in p1) {
      if (p1.hasOwnProperty(k)) {
        //assert.ok(p2.hasOwnProperty(k));
        var v1 = p1[k], v2 = p2[k];
        if (typeof v1 === 'number') {
          if (v1 !== v2) {
            return false;
          }
        } else if (_.isArray(v1)) {
          if (!_.isEqual(v1, v2)) {
            return false;
          }
        } else {
          return false;
        }
      }
    }
    return true;
  }

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

  // Checks whether two functions are equivalent
  var fnEquivCache = {};
  function fnsEqual(f1, f2) {
    // If the two functions are literally the same closure, then of course
    //    they are equivalent.
    if (f1 === f2) return true;
    // Otherwise, they're equivalent if they come from the same source location
    //    and the values of the variables they close over are the same.
    // First, we check if the functions actually have this metadata. External header
    //    functions do not, so we must return false, to ensure correct behavior.
    if (f1.__lexid === undefined || f2.__lexid === undefined) return false;
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
    if (!storesEqual(this.inStore, s)) {
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

  // Abstraction representing a master list of distributions
  // (lets us abstract over whether we're using an array or a hash table)

  function ArrayDistMasterList() {
    this.distNodes = [];
  }

  ArrayDistMasterList.prototype.size = function() { return this.distNodes.length; }
      ArrayDistMasterList.prototype.oldSize = function() {
        return this.oldDistNodes === undefined ? undefined : this.oldDistNodes.length;
      }

      ArrayDistMasterList.prototype.addDist = function(node) {
        this.distNodes.push(node);
      };

  ArrayDistMasterList.prototype.removeDist = function(node) {
    // Set it up to be removed as a post-process
    touch(node);
    node.reachable = false;
  };

  ArrayDistMasterList.prototype.preProposal = function() {
    this.oldDistNodes = this.distNodes.slice();
  };

  ArrayDistMasterList.prototype.postProposal = function() {
    this.distNodes = _.filter(this.distNodes, function(node) {
      return node.reachable;
    });
  };

  ArrayDistMasterList.prototype.getRandom = function() {
    var idx = Math.floor(util.random() * this.distNodes.length);
    return this.distNodes[idx];
  };

  ArrayDistMasterList.prototype.restoreOnReject = function() {
    this.distNodes = this.oldDistNodes;
  };


  function HashtableDistMasterList() {
    this.distNodeMap = new Hashtable();
    this.distsAdded = [];
    this.distsRemoved = [];
    this.numDists = 0;
  }

  HashtableDistMasterList.prototype.size = function() { return this.numDists; }
      HashtableDistMasterList.prototype.oldSize = function() { return this.oldNumDists; }

      HashtableDistMasterList.prototype.addDist = function(node) {
        this.distNodeMap.put(node.address, node);
        this.distsAdded.push(node);
        this.numDists++;
        // this.checkConsistency("addDist");
      };

  HashtableDistMasterList.prototype.removeDist = function(node) {
    this.distNodeMap.remove(node.address);
    this.distsRemoved.push(node);
    this.numDists--;
    // this.checkConsistency("removeDist");
  };

  HashtableDistMasterList.prototype.preProposal = function() {
    this.oldNumDists = this.numDists;
    this.distsAdded = [];
    this.distsRemoved = [];
  };

  HashtableDistMasterList.prototype.postProposal = function() {};

  HashtableDistMasterList.prototype.getRandom = function() { return this.distNodeMap.getRandom(); }

      HashtableDistMasterList.prototype.restoreOnReject = function() {
        // this.checkConsistency("restoreOnReject");
        this.numDists = this.oldNumDists;
        var n = this.distsAdded.length;
        while (n--) {
          var node = this.distsAdded[n];
          this.distNodeMap.remove(node.address);
        }
        n = this.distsRemoved.length;
        while (n--) {
          var node = this.distsRemoved[n];
          this.distNodeMap.put(node.address, node);
        }
      };

  // For debugging
  HashtableDistMasterList.prototype.checkConsistency = function(tag) {
    for (var i = 0; i < this.distsAdded.length; i++) {
      var addr = this.distsAdded[i].address;
      if (!this.distNodeMap.get(addr))
        throw "WTF - hash table doesn't contain node " + addr + ' that we added (' + tag + ')';
    }
    for (var i = 0; i < this.distsRemoved.length; i++) {
      var addr = this.distsRemoved[i].address;
      if (this.distNodeMap.get(addr))
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
        if (this.idsToRemove[this.id(node.address)]) {
          node.removeFromCache();
        }
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

  function IncrementalMH(s, k, a, wpplFn, opts) {
    util.throwUnlessOpts(opts, 'IncrementalMH');
    // Extract options
    var numSamples = opts.samples === undefined ? 1 : opts.samples;
    var dontAdapt = opts.dontAdapt === undefined ? false : opts.dontAdapt;
    var debuglevel = opts.debuglevel === undefined ? 0 : opts.debuglevel;
    var verbose = opts.verbose === undefined ? false : opts.verbose;
    var justSample = opts.justSample === undefined ? false : opts.justSample;
    var doFullRerun = opts.doFullRerun === undefined ? false : opts.doFullRerun;
    var onlyMAP = opts.onlyMAP === undefined ? false : opts.onlyMAP;
    var minHitRate = opts.cacheMinHitRate === undefined ? 0.00000001 : opts.cacheMinHitRate;
    var fuseLength = opts.cacheFuseLength === undefined ? 50 : opts.cacheFuseLength;
    var lag = opts.lag === undefined ? 0 : opts.lag;
    var iterFuseLength = opts.cacheIterFuseLength === undefined ? 10 : opts.cacheIterFuseLength;
    var burn = opts.burn === undefined ? 0 : opts.burn;
    var verboseLag = opts.verboseLag === undefined ? 1 : opts.verboseLag;

    // Doing a full re-run doesn't really jive with the heuristic we use for adaptive
    //    caching, so disable adaptation in this case.
    if (doFullRerun)
      dontAdapt = true;

    DEBUG = debuglevel;
    this.verbose = verbose;

    this.k = k;
    this.oldStore = s;
    this.iterations = numSamples * (lag + 1) + burn;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.aggregator = (justSample || onlyMAP) ?
        new MaxAggregator(justSample) :
        new CountAggregator();

    this.totalIterations = this.iterations;
    this.acceptedProps = 0;
    this.lag = lag;
    this.burn = burn;
    this.verboseLag = verboseLag;

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
    this.distMasterList = new HashtableDistMasterList();
    // this.distMasterList = new ArrayDistMasterList();
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

  IncrementalMH.prototype.sample = function(s, k, a, dist, name) {
    var n = this.cachelookup(DistNode, s, k, a, dist);
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
        var iternum = this.totalIterations - this.iterations;
        debuglog(1, 'iteration', iternum);
        if (this.verbose && (this.iterations % this.verboseLag === 0)) {
          if (iternum > this.burn) {
            console.log('IncrementalMH iteration ' + (iternum - this.burn) +
                ' / ' + (this.totalIterations - this.burn));
          } else {
            console.log('IncrementalMH burnin ' + iternum + ' / ' + this.burn);
          }
        }
        // Continue proposing as normal
        this.iterations--;

        this.distMasterList.postProposal();

        debuglog(2, 'Num vars:', this.distMasterList.size());
        debuglog(2, 'Touched nodes:', this.touchedNodes.length);

        // Accept/reject the current proposal
        var acceptance = acceptProb(this.score, this.oldScore,
                                    this.distMasterList.size(), this.distMasterList.oldSize(),
                                    this.rvsPropLP, this.fwdPropLP);
        debuglog(1, 'num vars:', this.distMasterList.size(), 'old num vars:', this.distMasterList.oldSize());
        debuglog(1, 'acceptance prob:', acceptance);
        if (util.random() >= acceptance) {
          debuglog(1, 'REJECT');
          this.score = this.oldScore;
          var n = this.touchedNodes.length;
          while (n--) restoreSnapshot(this.touchedNodes[n]);
          this.distMasterList.restoreOnReject();
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

        // Record this sample, if lag allows for it and not in burnin period
        if ((iternum % (this.lag + 1) === 0) && (iternum >= this.burn)) {
          // Replace val with accumulated query, if need be.
          if (val === env.query)
            val = this.query.getTable();
          // add val to hist:
          this.aggregator.add(val, this.score);
        }

        if (DEBUG >= 6) {
          debuglog(6, '=== Cache status ===');
          this.cacheRoot.print();
        }

        // this.checkReachabilityConsistency();

        if (this.doAdapt)
          this.cacheAdapter.adapt(this.cacheRoot);

        if (this.distMasterList.numDists > 0) {
          // Prepare to make a new proposal
          this.oldScore = this.score;
          this.distMasterList.preProposal();
          this.touchedNodes = [];
          this.fwdPropLP = 0;
          this.rvsPropLP = 0;
          // Select distribution to change.
          var propnode = this.distMasterList.getRandom();
          // Propose change and resume execution
          debuglog(1, '----------------------------------------------------------------------');
          debuglog(1, 'PROPOSAL', 'type:', propnode.dist, 'address:', propnode.address);
          return propnode.propose();
        } else {
          return this.runFromStart();
        }
      }
    } else {
      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;

      if (DEBUG >= 5) {
        console.log('Acceptance ratio: ' + this.acceptedProps / this.totalIterations);
        this.cacheAdapter.report();
      }

      // Return by calling original continuation:
      return k(this.oldStore, this.aggregator.toDist());
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

  IncrementalMH.prototype.addDist = function(node) {
    tabbedlog(3, node.depth, 'new distribution');
    this.distMasterList.addDist(node);
    this.fwdPropLP += node.score;
  };

  IncrementalMH.prototype.removeDist = function(node) {
    tabbedlog(3, node.depth, 'kill distribution', node.address);
    this.distMasterList.removeDist(node);
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

  function imh(s, cc, a, wpplFn, opts) {
    opts = opts || {};
    return new IncrementalMH(s, cc, a, wpplFn, opts).run();
  }

  return {
    IncrementalMH: imh
  };

};
