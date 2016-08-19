'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var ad = require('../ad');
var paramStruct = require('../paramStruct');
var guide = require('../guide');

module.exports = function(env) {

  function ELBO2(wpplFn, s, a, options, params, step, cont) {
    this.opts = util.mergeDefaults(options, {
      samples: 1,
      dumpGraph: false, // Write a DOT file representation of first graph to disk.
      showGraph: false  // Show info about the first graph in the console.
    });

    // The current values of all initialized parameters.
    // (Scalars/tensors, not their AD nodes.)
    this.params = params;

    this.step = step;
    this.cont = cont;

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    // Initialize mapData state.
    this.mapDataStack = [{multiplier: 1}];
    this.mapDataIx = {};

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  function top(stack) {
    return stack[stack.length - 1];
  }

  // Build a graph to (coarsely) track dependency information so we
  // can perform *some* Rao-Blackwellization. This simple approach
  // builds a graph that represents:

  // 1. How p & q factorize.
  // 2. The conditional independence information from mapData.

  // This is used when building the AD graph to remove some
  // unnecessary terms from the weighting applied to each "grad logq"
  // factor in the LR part of the objective. This improves on the
  // naive implementation which weights each factor by logq - logp of
  // the full execution.

  // The graph is built as the program executes, then dependencies are
  // propagated by a separate pass. After this pass, a node's "deps"
  // property contains all the factors that need to be included in the
  // weighting of the corresponding grad logq factor.

  var nodeid = 0;

  function RootNode() {
    this.id = nodeid++;
    this.parents = [];
    this.deps = new Set(); // TODO: Probably not compatible with older versions of node.
  }

  function SampleNode(parent, logp, logq, logr, reparam, targetDist, multiplier) {
    this.id = nodeid++;
    var _logp = ad.value(logp);
    var _logq = ad.value(logq);
    var _logr = ad.value(logr);
    if (!isFinite(_logp)) {
      throw new Error('SampleNode: logp is not finite.');
    }
    if (!isFinite(_logq)) {
      throw new Error('SampleNode: logq is not finite.');
    }
    if (!isFinite(_logr)) {
      throw new Error('SampleNode: logr is not finite.');
    }
    this.parents = [parent];
    this.logp = logp;
    this.logq = logq;
    this.logr = logr;
    this.weight = _logq - _logp;
    this.reparam = reparam;
    this.deps = new Set().add(this);
    // Debug info.
    this.targetDist = targetDist;
    this.multiplier = multiplier;
  }

  SampleNode.prototype.label = function() {
    return this.targetDist.meta.name + '(' + this.id + ')';
  };

  function FactorNode(parent, score, multiplier) {
    this.id = nodeid++;
    var _score = ad.value(score);
    if (!isFinite(_score)) {
      throw new Error('FactorNode: score is not finite.');
    }
    this.parents = [parent];
    this.score = score;
    this.weight = -_score;
    this.deps = new Set().add(this);
    // Debug info.
    this.id = nodeid++;
    this.multiplier = multiplier;
  }

  FactorNode.prototype.label = function() {
    return 'Factor(' + this.id + ')';
  };

  // JoinNode provides a convenient way to collect together multiple
  // paths after a mapData.
  function JoinNode() {
    this.id = nodeid++;
    this.parents = [];
    this.deps = new Set();
  }

  // TODO: It's possible for this to take quadratic time. Imagine we
  // have no mapData, then the number of "deps" we copy is O(n) and we
  // have n sample nodes. Clearly in this case we can do this in
  // linear time, what's the best way to do better in general?

  // Set union. Note, this modifies s1.
  function union(s1, s2) {
    s2.forEach(function(x) { s1.add(x); });
  }

  function propagateDependencies(nodes) {
    // Note that this modifies the graph.
    var i = nodes.length;
    while(--i) {
      var node = nodes[i];
      node.parents.forEach(function(parent) {
        union(parent.deps, node.deps);
      });
    }
  }

  var edge = function(parent, child) {
    return '  ' + parent.id + ' -> ' + child.id + ';';
  };

  var shape = function(node, shape) {
    return '  ' + node.id + ' [shape = "' + shape + '"]';
  };

  var label = function(node) {
    return '  ' + node.id + ' [label = "' + node.label() + '"]';
  };

  function generateDot(nodes) {
    var edges = [];
    var append = function(x) { edges.push(x); };
    nodes.forEach(function(node) {
      if (node instanceof FactorNode) {
        append(shape(node, 'box'));
      }
      if (node instanceof RootNode || node instanceof JoinNode) {
        append(shape(node, 'point'));
      }
      if (node.label) {
        append(label(node));
      }
      node.parents.forEach(function(parent) {
        append(edge(parent, node));
      });
    });
    return 'digraph {\n' + edges.join('\n') + '\n}\n';
  };

  function showGraph(nodes) {
    console.log('------------------------------');
    nodes.forEach(function(node) {
      if (!(node instanceof SampleNode)) { return; }
      console.log('Node: ' + node.label());
      console.log('Multiplier: ' + node.multiplier);
      console.log('Downstream dependencies:');
      node.deps.forEach(function(d) {
        if (d !== node) {
          console.log('  ' + d.label());
        }
      });
      console.log('------------------------------');
    });
  }

  function buildObjective(nodes) {

    // Likelihood-ratio term.
    var lr = nodes.reduce(function(acc, node) {

      // TODO: We can exclude reparameterized sample nodes here, since
      // we know logr doesn't depend on any parameters.

      if (!(node instanceof SampleNode)) {
        return acc;
      }

      // TODO: This is quadratic. Also see similar comment on
      // propagateDependencies.
      var weight = 0;
      node.deps.forEach(function(node) {
        if (!(node instanceof SampleNode || node instanceof FactorNode)) {
          throw 'Unexpected node type as dependency.';
        }
        return weight += node.weight;
      }, 0);

      return ad.scalar.add(acc, ad.scalar.mul(node.logr, weight));

    }, 0);

    // Path-wise term. The logp terms are also be used
    // when parameters are used directly in the generative model.
    var pw = nodes.reduce(function(acc, node) {
      if (node instanceof SampleNode) {
        // TODO: Drop logq here if not reparameterized as expectation
        // is zero. (I think this is true even when there are
        // dependencies between guide distributions, but double
        // check.)
        return ad.scalar.add(acc, ad.scalar.sub(
          node.logq, node.logp
        ));
      } else if (node instanceof FactorNode) {
        return ad.scalar.sub(acc, node.score);
      } else {
        return acc;
      };
    }, 0);

    var elbo = nodes.reduce(function(acc, node) {
      if (node instanceof SampleNode || node instanceof FactorNode) {
        return acc - node.weight;
      } else {
        return acc;
      }
    }, 0);

    var objective = ad.scalar.add(lr, pw);
    return {objective: objective, elbo: elbo};
  }

  ELBO2.prototype = {

    run: function() {

      var elbo = 0;
      var grad = {};

      return util.cpsLoop(
        this.opts.samples,

        // Loop body.
        function(i, next) {
          this.iter = i;
          return this.estimateGradient(function(g, elbo_i) {
            paramStruct.addEq(grad, g); // Accumulate gradient estimates.
            elbo += elbo_i;
            return next();
          });
        }.bind(this),

        // Loop continuation.
        function() {
          paramStruct.divEq(grad, this.opts.samples);
          elbo /= this.opts.samples;
          env.coroutine = this.coroutine;
          return this.cont(grad, elbo);
        }.bind(this));

    },

    // Compute a single sample estimate of the gradient.

    estimateGradient: function(cont) {
      // paramsSeen tracks the AD nodes of all parameters seen during
      // a single execution. These are the parameters for which
      // gradients will be computed.
      this.paramsSeen = {};

      // This tracks nodes as we encounter them which saves doing a
      // topological sort later on.
      this.nodes = [];

      var root = new RootNode();
      this.prevNode = root; // prevNode becomes the parent of the next node.
      this.nodes.push(root);

      return this.wpplFn(_.clone(this.s), function() {

        propagateDependencies(this.nodes);

        if (this.step === 0 && this.iter === 0 && this.opts.dumpGraph) {
          // To vizualize with Graphviz use:
          // dot -Tpng -O deps.dot
          var dot = generateDot(this.nodes);
          var fs = require('fs');
          fs.writeFileSync('deps.dot', dot);
        }

        if (this.step === 0 && this.iter === 0 && this.opts.showGraph) {
          showGraph(this.nodes);
        }

        var ret = buildObjective(this.nodes);
        ret.objective.backprop();

        var grads = _.mapObject(this.paramsSeen, function(params) {
          return params.map(ad.derivative);
        });

        return cont(grads, ret.elbo);

      }.bind(this), this.a);

    },

    sample: function(s, k, a, dist, options) {
      options = options || {};

      var guideDist;
      if (options.guide) {
        guideDist = options.guide;
      } else {
        guideDist = guide.independent(dist, a, env);
      }

      var ret = this.sampleGuide(guideDist, options);
      var val = ret.val;

      var m = top(this.mapDataStack).multiplier;
      var logp = ad.scalar.mul(m, dist.score(val));
      var logq = ad.scalar.mul(m, ret.logq);
      var logr = ad.scalar.mul(m, ret.logr);

      var node = new SampleNode(
        this.prevNode, logp, logq, logr,
        ret.reparam, dist, m);

      this.prevNode = node;
      this.nodes.push(node);

      return k(s, val);
    },

    sampleGuide: function(dist, options) {
      var val, logq, logr, reparam;

      if ((!_.has(options, 'reparam') || options.reparam) &&
          dist.base && dist.transform) {
        // Use the reparameterization trick.
        var baseDist = dist.base();
        var z = baseDist.sample();
        logr = baseDist.score(z);
        val = dist.transform(z);
        logq = dist.score(val);
        reparam = true;
      } else if (options.reparam && !(dist.base && dist.transform)) {
        throw dist + ' does not support reparameterization.';
      } else {
        val = dist.sample();
        logq = logr = dist.score(val);
        reparam = false;
      }

      return {val: val, logq: logq, logr: logr, reparam: reparam};
    },

    factor: function(s, k, a, score, name) {
      var m = top(this.mapDataStack).multiplier;
      var node = new FactorNode(this.prevNode, ad.scalar.mul(m, score), m);
      this.prevNode = node;
      this.nodes.push(node);
      return k(s);
    },

    mapDataFetch: function(data, batchSize, address) {

      // Compute batch indices.

      var ix;
      if (_.has(this.mapDataIx, address)) {
        ix = this.mapDataIx[address];
      } else {
        if (batchSize === data.length) {
          // Use all the data, in order.
          ix = null;
        } else {
          ix = _.times(batchSize, function() {
            return Math.floor(util.random() * data.length);
          });
        }
        // Store batch indices so that we can use the same mini-batch
        // across samples.
        this.mapDataIx[address] = ix;
      }

      // Compute the multiplier required to account for the fact we're
      // only looking at a subset of the data.
      var thisM = batchSize > 0 ? (data.length / batchSize) : 1;
      var prevM = top(this.mapDataStack).multiplier;
      var m = thisM * prevM;

      this.mapDataStack.push({
        prevNode: this.prevNode,
        join: new JoinNode(),
        multiplier: m
      });

      return ix;
    },

    mapDataEnter: function() {
      // For every observation function, set the current node back to
      // the node encountered immediately before entering mapData.
      this.prevNode = top(this.mapDataStack).prevNode;
    },

    mapDataLeave: function() {
      // Hook-up the join node to the last node on this branch. If
      // there were no sample/factor nodes created in the observation
      // function then this hooks the join node up the most node
      // encountered immediately before entering mapData.
      top(this.mapDataStack).join.parents.push(this.prevNode);
    },

    mapDataFinal: function(address) {
      var top = this.mapDataStack.pop();
      var join = top.join;
      // Handle the degenerate case where the batch is empty.
      if (join.parents.length === 0) {
        join.parents.push(top.prevNode);
      }
      this.prevNode = join;
      this.nodes.push(join);
    }

  };

  return function() {
    var coroutine = Object.create(ELBO2.prototype);
    ELBO2.apply(coroutine, arguments);
    return coroutine.run();
  };

};
