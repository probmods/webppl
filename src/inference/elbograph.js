'use strict';

var ad = require('../ad');

var nodeid = 0;

function RootNode() {
  this.id = nodeid++;
  this.parents = [];
  this.weight = 0;
}

function SampleNode(parent, logp, logq, reparam, address, targetDist, guideDist, value, multiplier, debug) {
  this.id = nodeid++;
  var _logp = ad.value(logp);
  var _logq = ad.value(logq);
  this.parents = [parent];
  this.logp = logp;
  this.logq = logq;
  this.weight = debug ? 1 : _logq - _logp;
  this.reparam = reparam;
  this.address = address;
  this.multiplier = multiplier;
  // Debug info.
  this.targetDist = targetDist;
}

SampleNode.prototype.label = function() {
  return [
    this.targetDist.meta.name + '(' + this.id + ')',
    'w=' + this.weight,
    'm=' + this.multiplier
  ].join('\\n');
};

function FactorNode(parent, score, multiplier, debug) {
  this.id = nodeid++;
  var _score = ad.value(score);
  this.parents = [parent];
  this.score = score;
  this.weight = debug ? 1 : -_score;
  this.multiplier = multiplier;
}

FactorNode.prototype.label = function() {
  return [
    'Factor' + '(' + this.id + ')',
    'w=' + this.weight,
    'm=' + this.multiplier
  ].join('\\n');
};

// Created when entering mapData.
function SplitNode(parent, batchSize, n, joinNode) {
  this.id = nodeid++;
  this.parents = [parent];
  this.batchSize = batchSize;
  this.n = n; // data.length
  this.joinNode = joinNode;
  this.weight = 0;
}

// Created when leaving mapData.
function JoinNode() {
  this.id = nodeid++;
  this.parents = [];
  this.weight = 0;
}

function propagateWeights(nodes) {
  // Note that this modifies the weights of the graph in-place.
  var i = nodes.length;
  while (--i) {
    var node = nodes[i];
    if (node instanceof SplitNode) {
      // Account for (a) the fact that we (potentially) only looked
      // at a subset of the data (i.e. used mini-batches) and (b)
      // the weights downstream of the associated join node will
      // have been included in the split node's weight once for each
      // execution of the observation function.
      node.weight = (node.n / node.batchSize) * node.weight - ((node.n - 1) * node.joinNode.weight);
    }
    node.parents.forEach(function(parent) {
      parent.weight += node.weight;
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
    if (node instanceof RootNode ||
        node instanceof JoinNode ||
        node instanceof SplitNode) {
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
}

module.exports = {
  RootNode: RootNode,
  SampleNode: SampleNode,
  FactorNode: FactorNode,
  SplitNode: SplitNode,
  JoinNode: JoinNode,
  propagateWeights: propagateWeights,
  generateDot: generateDot
};
