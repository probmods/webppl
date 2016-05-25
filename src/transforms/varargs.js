'use strict';

var assert = require('assert');
var estraverse = require('estraverse');
var types = require('ast-types');
var esprima = require('esprima');

var Syntax = estraverse.Syntax;

var argumentsIdCounter = 0;
function makeArgumentsIdentifier() {
  argumentsIdCounter += 1;
  return '_arguments' + argumentsIdCounter;
}

var fnStack = [];

function pushFn(node) {
  if (node.type === Syntax.FunctionExpression) {
    fnStack.push(node);
  }
}

function popFn(node) {
  if (node.type === Syntax.FunctionExpression) {
    assert.strictEqual(node, fnStack[fnStack.length - 1]);
    fnStack.pop();
  }
}

function getEnclosingFunctionNode() {
  if (fnStack.length === 0) {
    throw 'Used "arguments" outside of function context!';
  }
  return fnStack[fnStack.length - 1];
}

function varargs(node) {

  switch (node.type) {

    // assign 'arguments' as first statement in body, rename to make it
    // survive subsequent trampoline closure introduction
    case Syntax.Identifier:
      if (node.name !== 'arguments') {
        return node;
      }
      var functionNode = getEnclosingFunctionNode();
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
        enter: function(node) {
          pushFn(node);
          return varargs(node);
        },
        leave: function(node) {
          popFn(node);
        }
      });
  return node;
}

module.exports = {
  varargs: varargsMain
};
