////////////////////////////////////////////////////////////////////
// Incrementalized (i.e. caching) Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');

module.exports = function(env) {

  // ------------------------------------------------------------------

  // Debugging output

  var DEBUG = false;
  // var DEBUG = true;
  function debuglog() {
    if (DEBUG)
      console.log.apply(global, arguments);
  }

  function tabbedlog(depth) {
    if (DEBUG) {
      var args = Array.prototype.slice.call(arguments, 1);
      var pad = "";
      for (var i = 0; i < depth; i++) pad += "  ";
      pad += "["+depth+"] ";
      console.log.apply(global, [pad].concat(args));
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

  function restoreSnapshot(node) {
    for (var prop in node.__snapshot) {
      node[prop] = node.__snapshot[prop];
    }
    delete node.__snapshot;
  }

  function discardSnapshot(node) {
    delete node.__snapshot;
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

    this.reachable = true;
    this.needsUpdate = false;

    this.params = params;
    this.val = erp.sample(params);
    this.score = 0; this.rescore();

    // Add this to the master list of ERP nodes
    this.coroutine.trace.erpNodes.push(this);
    this.coroutine.fwdPropLP += this.score;
    tabbedlog(this.depth, "new ERP");
  }

  ERPNode.prototype.print = function() {
    tabbedlog(this.depth, "ERPNode " + this.address);
  };

  ERPNode.prototype.execute = function() {
    tabbedlog(this.depth, "execute ERP");
    // Bail out early if we know the proposal will be rejected
    if (this.score === -Infinity) {
      tabbedlog(this.depth, "score became -Infinity; bailing out early");
      return this.coroutine.exit();
    } else {
      if (this.needsUpdate) {
        tabbedlog(this.depth, "yes, ERP params changed");
        this.needsUpdate = false;
        this.rescore();
        this.parent.notifyChildChanged(this);
      }
      else {
        tabbedlog(this.depth, "no, ERP params have not changed");
      }
      return this.kontinue();
    }
  };

  ERPNode.prototype.registerInputChanges = function(s, k, params) {
    updateProperty(this, "store", _.clone(s));
    updateProperty(this, "continuation", k);
    this.reachable = true;
    this.needsUpdate = false;
    // Check params for changes
    for (var i = 0; i < params.length; i++)
    {
      if (params[i] !== this.params[i]) {
        this.needsUpdate = true;
        updateProperty(this, "params", params);
        break;
      }
    }
  };

  ERPNode.prototype.kontinue = function() {
    this.parent.notifyChildExecuted(this);
    // Call continuation
    return this.continuation(this.store, this.val);
  };

  ERPNode.prototype.killDescendantLeaves = function() {
    tabbedlog(this.depth, "kill ERP");
    touch(this);
    this.reachable = false;
    this.coroutine.rvsPropLP += this.score;
    this.coroutine.trace.score -= this.score;
  };

  ERPNode.prototype.propose = function() {
    tabbedlog(this.depth, "proposing change to ERP");
    var oldval = this.val;
    var newval = this.erp.sample(this.params);
    // If the value didn't change, then just bail out (we know the
    //    the proposal will be accepted)
    if (oldval === newval) {
      tabbedlog(this.depth, "proposal didn't change value; bailing out early");
      return this.coroutine.exit();
    } else {
      updateProperty(this, "store", _.clone(this.store));
      updateProperty(this, "val", newval);
      var oldscore = this.score;
      this.rescore();
      this.coroutine.rvsPropLP = oldscore;
      this.coroutine.fwdPropLP = this.score;
      this.parent.notifyChildChanged(this);
      this.needsUpdate = false;
      return this.execute();
    }
  };

  ERPNode.prototype.rescore = function() {
    var oldscore = this.score;
    updateProperty(this, "score", this.erp.score(this.params, this.val));
    this.coroutine.trace.score += this.score - oldscore;
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

    this.reachable = true;

    this.rescore(0, args[0]);

    tabbedlog(this.depth, "new factor");
  }

  FactorNode.prototype.print = function() {
    tabbedlog(this.depth, "FactorNode " + this.address);
  };

  FactorNode.prototype.execute = function() {
    // Bail out early if we know proposal will be rejected
    if (this.score === -Infinity) {
      tabbedlog(this.depth, "score became -Infinity; bailing out early");
      return this.coroutine.exit();
    } else {
      return this.kontinue();
    }
  };

  FactorNode.prototype.registerInputChanges = function(s, k, args) {
    updateProperty(this, "store", s);
    updateProperty(this, "continuation", k);
    this.reachable = true;
    if (this.score !== args[0])
      this.rescore(this.score, args[0]);
  };

  FactorNode.prototype.kontinue = function() {
    this.parent.notifyChildExecuted(this);
    return this.continuation(this.store);
  };

  FactorNode.prototype.killDescendantLeaves = function() {
    tabbedlog(this.depth, "kill factor");
    touch(this);
    this.reachable = false;
    this.coroutine.trace.score -= this.score;
  }

  FactorNode.prototype.rescore = function(oldscore, score) {
    updateProperty(this, "score", score);
    this.coroutine.trace.score += score - oldscore;
  };

  // ------------------------------------------------------------------

  // A cached, general WebPPL function call
  function FunctionNode(coroutine, parent, s, k, a, fn, args) {
    this.coroutine = coroutine;

    this.continuation = k;
    this.address = a;
    this.func = fn;

    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.children = [];
    this.nextChildIdx = 0;

    this.reachable = true;
    this.needsUpdate = true;

    this.inStore = _.clone(s);
    this.args = args;

    this.retval = undefined;
    this.outStore = null;
  }

  FunctionNode.prototype.print = function() {
    tabbedlog(this.depth, "FunctionNode " + this.address);
    for (var i = 0; i < this.children.length; i++)
      this.children[i].print();
  };

  FunctionNode.prototype.execute = function() {
    tabbedlog(this.depth, "execute function");
    if (this.needsUpdate) {
      tabbedlog(this.depth, "yes, function args changed; re-running");
      this.needsUpdate = false;
      // Keep track of program stack
      this.coroutine.nodeStack.push(this);
      // Reset nextChildIdx
      this.nextChildIdx = 0;
      // Preserve reference to coroutine object so
      //    continuation can refer to it.
      var coroutine = this.coroutine;
      return this.func.apply(global, [
        this.inStore,
        function(s, retval) {
          // Recover a reference to 'this'
          var that = coroutine.nodeStack.pop();
          tabbedlog(that.depth, "continue from function");
          // If the return value hasn't changed, then we can bail early.
          // TODO: Should we use deep (i.e. structural) equality tests here?
          // if (_.isEqual(that.retval, retval)) {
          if (that.retval === retval) {
            tabbedlog(that.depth, "function return val not changed; bailing");
            return coroutine.exit();
          }
          tabbedlog(that.depth, "function return val has changed");
          // Update output values
          updateProperty(that, "retval", retval);
          updateProperty(that, "outStore", _.clone(s));
          // Continue execution
          if (that.parent !== null)
            that.parent.notifyChildChanged(that);
          return that.kontinue();
        },
        this.address
      ].concat(this.args));
    } else {
      tabbedlog(this.depth, "no, function args have not changed; continuing");
      return this.kontinue();
    }
  };

  FunctionNode.prototype.registerInputChanges = function(s, k, args) { 
    updateProperty(this, "continuation", k);
    this.reachable = true;
    this.needsUpdate = false;
    // Check args for changes
    // TODO: Should we use deep (i.e. structural) equality tests here?
    for (var i = 0; i < args.length; i++)
    {
      // if (!_.isEqual(args[i], this.args[i])) {
      if (args[i] !== this.args[i]) {
        this.needsUpdate = true;
        updateProperty(this, "args", args);
        break;
      }
    }
    // Check store for changes
    // TODO: Should we use deep (i.e. structural) equality tests here?
    if (!this.needsUpdate) {
      for (var prop in s) {
        // if (!_.isEqual(this.inStore[prop], s[prop])) {
        if (this.inStore[prop] !== s[prop]) {
          this.needsUpdate = true;
          updateProperty(this, "inStore", _.clone(s));
          break;
        }
      }
    }
  };

  FunctionNode.prototype.killDescendantLeaves = function() {
    tabbedlog(this.depth, "kill function");
    var n = this.children.length;
    while(n--)
      this.children[n].killDescendantLeaves();
  };

  FunctionNode.prototype.kontinue = function() {

    // Clear out any children that have become unreachable
    //    before passing control back up to the parent
    var newchildren = [];
    var nchildren = this.children.length;
    for (var i = 0; i < nchildren; i++) {
      var child = this.children[i];
      // If the child is unreachable, recursively set all of its
      //    descendants to unreachable, so that any ERPs get marked
      //    unreachable and we know to remove them from the master list.
      if (!child.reachable)
        child.killDescendantLeaves();
      else
        newchildren.push(child);
    }
    updateProperty(this, "children", newchildren);
    if (this.parent !== null)
      this.parent.notifyChildExecuted(this);
    // Call continuation
    return this.continuation(this.outStore, this.retval);
  };

  FunctionNode.prototype.notifyChildExecuted = function(child) {
    var idx = this.children.indexOf(child);
    this.nextChildIdx = idx + 1;
  };

  FunctionNode.prototype.notifyChildChanged = function(child) {
    var idx = this.children.indexOf(child);
    // Children later in the execution order may become unreachable due
    //    to this change, so we mark them all as unreachable and see which
    //    ones we hit.
    var nchildren = this.children.length;
    for (var i = idx + 1; i < nchildren; i++) {
      touch(this.children[i]);
      this.children[i].reachable = false;
    }
  };

  // ------------------------------------------------------------------

  function IncrementalMH(s, k, a, wpplFn, numIterations) {
    this.returnHist = {};
    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.totalIterations = numIterations;
    this.acceptedProps = 0;

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  IncrementalMH.prototype.run = function() {
    this.trace = {
      cacheRoot: null,
      erpNodes: [],
      score: 0
    };
    this.touchedNodes = [];
    this.fwdPropLP = 0;
    this.rvsPropLP = 0;
    this.nodeStack = [];
    // Cache the top-level function, so that we always have a valid
    //    cache root.
    debuglog("-------------------------------------");
    debuglog("RUN FROM START");
    return this.incrementalize(this.s, env.exit, this.a, this.wpplFn);
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
    tabbedlog(node.depth, "touch");
    this.touchedNodes.push(node);
  };

  function acceptProb(currTrace, oldTrace, rvsPropLP, fwdPropLP) {
    if (!oldTrace || oldTrace.score === -Infinity) { return 1; } // init
    if (currTrace.score === -Infinity) return 0;  // auto-reject
    debuglog("currTrace.score: " + currTrace.score +
             ", oldTrace.score: " + oldTrace.score);
    debuglog("rvsPropLP: " + rvsPropLP + ", fwdPropLP: " + fwdPropLP);
    var fw = -Math.log(oldTrace.erpNodes.length) + fwdPropLP;
    var bw = -Math.log(currTrace.erpNodes.length) + rvsPropLP;
    var p = Math.exp(currTrace.score - oldTrace.score + bw - fw);
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
      if (!this.isInitialized() && this.trace.score === -Infinity) {
        return this.run();
      } else {
        // Continue proposing as normal
        this.iterations--;

        // Remove any erpNodes that have become unreachable.
        var nVarsOld = this.trace.erpNodes.length;
        this.trace.erpNodes = _.filter(this.trace.erpNodes, function(node) {
          return node.reachable;
        });

        debuglog("Num vars: " + this.trace.erpNodes.length);
        var nUnreachables = (nVarsOld - this.trace.erpNodes.length);
        if (nUnreachables > 0)
          debuglog("(Removed " + nUnreachables + " unreachable ERPs)");
        debuglog("(Touched " + this.touchedNodes.length + " nodes)");

        // Accept/reject the current proposal
        var acceptance = acceptProb(this.trace, this.backupTrace,
                                    this.rvsPropLP, this.fwdPropLP);
        debuglog("acceptance prob: " + acceptance);
        if (Math.random() >= acceptance) {
          debuglog("REJECT");
          // Restore score, erpNodes, and snapshotted states
          this.trace = this.backupTrace;
          var n = this.touchedNodes.length;
          while(n--) restoreSnapshot(this.touchedNodes[n]);
        }
        else {
          debuglog("ACCEPT");
          // Discard snapshots
          var n = this.touchedNodes.length;
          while(n--) discardSnapshot(this.touchedNodes[n]);
          this.acceptedProps++;
        }

        var val = this.trace.cacheRoot.retval;
        debuglog("return val: " + val);

        // Add return val to accumulated histogram
        var stringifiedVal = JSON.stringify(val);
        if (this.returnHist[stringifiedVal] === undefined) {
          this.returnHist[stringifiedVal] = { prob: 0, val: val };
        }
        this.returnHist[stringifiedVal].prob += 1;

        if (DEBUG) {
          debuglog("=== Cache status ===");
          this.trace.cacheRoot.print();
        }

        // Prepare to make a new proposal
        this.backupTrace = {
          cacheRoot: this.trace.cacheRoot,
          erpNodes: this.trace.erpNodes.slice(),
          score: this.trace.score
        };
        this.touchedNodes = [];
        this.fwdPropLP = 0;
        this.rvsPropLP = 0;
        // Select ERP to change.
        var idx = Math.floor(Math.random() * this.trace.erpNodes.length);
        var propnode = this.trace.erpNodes[idx];
        // Restore node stack up to this point
        this.restoreStackUpTo(propnode.parent);
        // Propose change and resume execution
        debuglog("-------------------------------------");
        debuglog("PROPOSAL");
        return propnode.propose();
      }
    } else {
      // Finalize returned histogram-based ERP
      var dist = erp.makeMarginalERP(this.returnHist);

      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;

      console.log("Acceptance ratio: " + this.acceptedProps / this.totalIterations);

      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  IncrementalMH.prototype.incrementalize = function(s, k, a, fn, args) {
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
      tabbedlog(currNode.depth, "lookup " + NodeType.name + " " + a);
      // Look for cache node among the children of currNode
      cacheNode = findNode(currNode.children, a, currNode.nextChildIdx);
      if (cacheNode) {
        // Lookup successful; check for changes to store/args and move on.
        tabbedlog(currNode.depth, "found");
        cacheNode.registerInputChanges(s, k, args);
      } else {
        // Lookup failed; create new node and insert it into currNode.children
        if (DEBUG) {
          var addrs = _.map(_.filter(currNode.children, function(node) { return node instanceof NodeType; }),
            function(node) { return node.address; });
          tabbedlog(currNode.depth, "*not* found; options were", addrs);
        }
        cacheNode = new NodeType(this, currNode, s, k, a, fn, args);
        var insertidx = currNode.nextChildIdx;
        var newchildren = currNode.children.slice();
        newchildren.splice(insertidx, 0, cacheNode);
        updateProperty(currNode, "children", newchildren);
      }
    }
    return cacheNode;
  };

  function findNode(nodes, address, nexti) {
    for (var i = nexti; i < nodes.length; i++) {
      if (nodes[i].address === address) {
        // Keep nodes ordered according to execution order: if
        // i !== nexti, then swap those two.
        if (i !== nexti) {
          var tmp = nodes[i];
          nodes[i] = nodes[nexti];
          nodes[nexti] = tmp;
        }
        return nodes[nexti];
      }
    }
    return undefined;
  }

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
