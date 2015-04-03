////////////////////////////////////////////////////////////////////
// Incrementalized (i.e. caching) Lightweight MH

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');
var Hashtable = require("../hashtable.js").Hashtable

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

    this.reachable = true;
    this.needsUpdate = false;

    this.params = params;
    this.val = erp.sample(params);
    this.score = 0; this.rescore();

    // Add this to the master list of ERP nodes
    this.coroutine.addERP(this);
  }

  ERPNode.prototype.print = function() {
    tabbedlog(this.depth, "ERPNode", this.address);
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
    this.coroutine.removeERP(this);
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
    this.coroutine.score += this.score - oldscore;
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
    tabbedlog(this.depth, "FactorNode", this.address);
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
    this.coroutine.score -= this.score;
  }

  FactorNode.prototype.rescore = function(oldscore, score) {
    updateProperty(this, "score", score);
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

    this.initialized = false;
    this.retval = undefined;
    this.outStore = null;
  }

  FunctionNode.prototype.print = function() {
    tabbedlog(this.depth, "FunctionNode", this.address);
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
          // If the return value and output store haven't changed, then we can bail early.
          // TODO: Should we use deep (i.e. structural) equality tests here?
          if (that.initialized && that.retval === retval && storesEqual(that.outStore, s)) {
            tabbedlog(that.depth, "function return val not changed; bailing");
            return coroutine.exit();
          }
          that.initialized = true;
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
      if (args[i] !== this.args[i]) {
        this.needsUpdate = true;
        updateProperty(this, "args", args);
        break;
      }
    }
    // Check store for changes
    // TODO: Should we use deep (i.e. structural) equality tests here?
    if (!this.needsUpdate) {
      if (!storesEqual(this.store, s)) {
        this.needsUpdate = true;
        updateProperty(this, "inStore", _.clone(s));
      }
    }
  };

  FunctionNode.prototype.killDescendantLeaves = function() {
    tabbedlog(this.depth, "kill function (and all descendant leaves)");
    var stack = [this];
    while (stack.length > 0) {
      var node = stack.pop();
      if (node.score !== undefined) node.killDescendantLeaves();
      else {
        var n = node.children.length;
        while(n--) stack.push(node.children[n]);
      }
    }
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
    var idx = Math.floor(Math.random()*this.erpNodes.length);
    return this.erpNodes[idx];
  };

  ArrayERPMasterList.prototype.restoreOnReject = function() {
    this.erpNodes = this.oldErpNodes;
  };


  function HastableERPMasterList() {
    this.erpNodeMap = new Hashtable();
    this.erpsAdded = [];
    this.erpsRemoved = [];
    this.numErps = 0;
  }

  HastableERPMasterList.prototype.size = function() { return this.numErps; }
  HastableERPMasterList.prototype.oldSize = function() { return this.oldNumErps; }

  HastableERPMasterList.prototype.addERP = function(node) {
    this.erpNodeMap.put(node.address, node);
    this.erpsAdded.push(node);
    this.numErps++;
  };

  HastableERPMasterList.prototype.removeERP = function(node) {
    this.erpNodeMap.remove(node.address);
    this.erpsRemoved.push(node);
    this.numErps--;
  };

  HastableERPMasterList.prototype.preProposal = function() {
    this.oldNumErps = this.numErps;
    this.erpsAdded = [];
    this.erpsRemoved = [];
  };

  HastableERPMasterList.prototype.postProposal = function() {};

  HastableERPMasterList.prototype.getRandom = function() { return this.erpNodeMap.getRandom(); }

  HastableERPMasterList.prototype.restoreOnReject = function() {
    this.numErps = this.oldNumErps;
    var n = this.erpsAdded.length;
    while(n--) this.erpNodeMap.remove(this.erpsAdded[n].address);
    n = this.erpsRemoved.length;
    while(n--) {
      var node = this.erpsRemoved[n];
      this.erpNodeMap.put(node.address, node);
    }
  };

  // ------------------------------------------------------------------

  function IncrementalMH(s, k, a, wpplFn, numIterations) {
    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.returnHist = {};
    this.MAP = { val: undefined, score: -Infinity };
    this.totalIterations = numIterations;
    this.acceptedProps = 0;

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  IncrementalMH.prototype.run = function() {
    this.cacheRoot = null;
    this.erpMasterList = new HastableERPMasterList();
    // this.erpMasterList = new ArrayERPMasterList();
    this.score = 0;
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
    this.touchedNodes.push(node);
  };

  function acceptProb(currScore, oldScore, currN, oldN, rvsPropLP, fwdPropLP) {
    if (oldScore === undefined) { return 1; } // init
    if (currScore === -Infinity) return 0;  // auto-reject
    debuglog("currScore:", currScore, 
             "oldScore", oldScore);
    debuglog("rvsPropLP:", rvsPropLP, "fwdPropLP:", fwdPropLP);
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
        // Continue proposing as normal
        this.iterations--;

        this.erpMasterList.postProposal();

        debuglog("Num vars:", this.erpMasterList.size());
        debuglog("Touched nodes:", this.touchedNodes.length);

        // Accept/reject the current proposal
        var acceptance = acceptProb(this.score, this.oldScore,
                                    this.erpMasterList.size(), this.erpMasterList.oldSize(),
                                    this.rvsPropLP, this.fwdPropLP);
        debuglog("acceptance prob:", acceptance);
        if (Math.random() >= acceptance) {
          debuglog("REJECT");
          this.score = this.oldScore;
          this.erpMasterList.restoreOnReject();
          var n = this.touchedNodes.length;
          while(n--) restoreSnapshot(this.touchedNodes[n]);
        }
        else {
          debuglog("ACCEPT");
          var n = this.touchedNodes.length;
          while(n--) discardSnapshot(this.touchedNodes[n]);
          this.acceptedProps++;
        }

        var val = this.cacheRoot.retval;
        debuglog("return val:", val);

        // Add return val to accumulated histogram
        var stringifiedVal = JSON.stringify(val);
        if (this.returnHist[stringifiedVal] === undefined) {
          this.returnHist[stringifiedVal] = { prob: 0, val: val };
        }
        this.returnHist[stringifiedVal].prob += 1;
         // also update the MAP
        if (this.score > this.MAP.score) {
          this.MAP.score = this.score;
          this.MAP.val = val;
        }

        // if (DEBUG) {
        //   debuglog("=== Cache status ===");
        //   this.cacheRoot.print();
        // }

        // Prepare to make a new proposal
        this.oldScore = this.score;
        this.erpMasterList.preProposal();
        this.touchedNodes = [];
        this.fwdPropLP = 0;
        this.rvsPropLP = 0;
        // Select ERP to change.
        var propnode = this.erpMasterList.getRandom();
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
      dist.MAP = this.MAP.val;

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
    if (this.cacheRoot === null) {
      cacheNode = new NodeType(this, null, s, k, a, fn, args);
      this.cacheRoot = cacheNode;
    } else {
      var currNode = this.nodeStack[this.nodeStack.length-1];
      tabbedlog(currNode.depth, "lookup", NodeType.name, a);
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

  IncrementalMH.prototype.addERP = function(node) {
    this.erpMasterList.addERP(node);
    this.fwdPropLP += node.score;
    tabbedlog(node.depth, "new ERP");
  };

  IncrementalMH.prototype.removeERP = function(node) {
    this.erpMasterList.removeERP(node);
    this.rvsPropLP += node.score;
    this.score -= node.score;
    tabbedlog(node.depth, "kill ERP");
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
