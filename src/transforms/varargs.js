'use strict';

var assert = require('assert');
var estraverse = require('estraverse');
var types = require('ast-types');
var escodegen = require('escodegen');
var esprima = require('esprima');

var build = types.builders;
var Syntax = estraverse.Syntax;

var argumentsIdCounter = 0;
function makeArgumentsIdentifier() {
  argumentsIdCounter += 1;
  return '_arguments' + argumentsIdCounter;
}

function findEnclosingFunctionNode(node) {
  var ancestor = node;
  while (ancestor !== undefined) {
    if (ancestor.type === 'FunctionExpression') {
      break;
    }
    ancestor = ancestor.parentNode;
  }
  if (ancestor === undefined) {
    throw 'Used "arguments" outside of function context!';
  }
  return ancestor;
}

function addParents(node, parent) {
  node.parentNode = parent;
  return node;
}

function varargs(node) {

  if (node.seenByVarargs) {
    return node;
  }
  node.seenByVarargs = true;

  switch (node.type) {

    // assign 'arguments' as first statement in body, rename to make it
    // survive subsequent trampoline closure introduction
    case Syntax.Identifier:
      if (node.name !== 'arguments') {
        return node;
      }
      var functionNode = findEnclosingFunctionNode(node);
      var argumentsId = functionNode.argumentsId || makeArgumentsIdentifier();
      node.name = argumentsId;
      if (functionNode.argumentsId === undefined) {
        functionNode.argumentsId = argumentsId;
        assert.equal(functionNode.body.type, 'BlockStatement');
        var argsDeclaration = (
            esprima.parse('var REPLACEME = Array.prototype.slice.call(arguments, 3);').body[0]);
        argsDeclaration.declarations[0].id.name = argumentsId;
        functionNode.body.body = [argsDeclaration].concat(functionNode.body.body);
      }
      return node;

    default:
      return node;

  }

}

function varargsMain(node) {
  node = estraverse.replace(
      node, {
        enter: addParents,
        leave: varargs
      });
  return node;
}

module.exports = {
  varargs: varargsMain
};
