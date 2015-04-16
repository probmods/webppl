'use strict';

var traverse = require('estraverse').traverse;
var Syntax = require('estraverse').Syntax;

var Set = require('immutable').Set;
var Stack = require('immutable').Stack;

function analyzeRefs(node) {
  var stack = new Stack();

  var heapRefs = {};

  traverse(node, {
    enter: function(node, parent) {
      switch (node.type) {
        case Syntax.Identifier:
          if (stack.peek().contains(node.name)) {
            node.heapRef = false;
          }
          else {
            node.heapRef = true;
            heapRefs[node.name] = true;
          }
          break;
        case Syntax.FunctionExpression:
          var xs = node.params.reduce(function(xs, param) {
            return xs.add(param.name);
          }, new Set());

          if (node.params.length > 1) {
            stack = stack.push(xs);
          }
          else {
            stack = stack.pop().push(stack.first().union(xs));
          }

          break;
        case Syntax.VariableDeclarator:
          stack = stack.pop().push(stack.first().add(node.id.name));
          break;
        default:
      }
    },
    leave: function(node, parent) {
      switch (node.type) {
        case Syntax.FunctionExpression:
          if (node.params.length > 1) {
            stack = stack.pop();
          }
          break;
        default:
      }
    },
    keys: {
      FunctionExpression: ['body'],
      ObjectExpression: ['object'],
      VariableDeclarator: ['init']
    }
  });

  return function(x) {
    return heapRefs[x] || false;
  };
}

exports.analyzeRefs = analyzeRefs;
exports.isHeapRef = function(node) {
  return node.heapRef || false;
};

