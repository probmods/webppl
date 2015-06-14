'use strict';

var _ = require('underscore');

var Syntax = require('estraverse').Syntax;
var replace = require('estraverse').replace;
var build = require('ast-types').builders;
var types = require('ast-types').types;
var makeGensym = require('../util').makeGensym;


// filter out:
// -- member expression properties


var genid = null;
var boundVarsStack = null;
var freeVarsStack = null;
var nodeStack = null;

var literalIdentifiers = {
  undefined: true,
  NaN: true,
  Infinity: true
};

function identifierIsVar(node) {
  // esprima represents some special literals as Identifer nodes; skip those
  if (literalIdentifiers[node.name]) return false;
  // exprima also represents non-computed object member access with an
  //    Identifer node, so skip those as well.
  var ntop = nodeStack[nodeStack.length - 1];
  if (ntop.type === Syntax.MemberExpression && !ntop.computed &&
      node === ntop.property) return false;
  // Property keys in object literal expressions are also Identifer nodes
  if (ntop.type === Syntax.Property && node === ntop.key) return false;
  return true;
}

function enter(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      // Bind the formal parameters of the function
      var boundVars = {};
      for (var i = 0; i < node.params.length; i++)
        boundVars[node.params[i].name] = true;
      boundVarsStack.push(boundVars);
      // Create a new (empty) set of free vars for this function body
      freeVarsStack.push({});
      break;
    case Syntax.VariableDeclarator:
      // Bind any vars that are declared locally
      if (boundVarsStack.length > 0)
        boundVarsStack[boundVarsStack.length - 1][node.id.name] = true;
      break;
    case Syntax.Identifier:
      if (boundVarsStack.length > 0 && identifierIsVar(node)) {
        // If the Identifier isn't already bound, then it's a free var
        if (!boundVarsStack[boundVarsStack.length - 1][node.name])
          freeVarsStack[freeVarsStack.length - 1][node.name] = true;
      }
      break;
    default:
  }
  nodeStack.push(node);
}

function exit(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      // Wrap the function expression in a call to _Fn.tag,
      //    which tags the function with a lexically-unique id and a list
      //    of its free variable values.
      var freeVars = freeVarsStack.pop();
      var freeVarNodes = [];
      for (var name in freeVars) {
        freeVarNodes.push(build.identifier(name));
      }
      boundVarsStack.pop();
      return build.callExpression(
          build.memberExpression(build.identifier('_Fn'),
          build.identifier('tag'), false),
          [node, build.literal(genid(0)), build.arrayExpression(freeVarNodes)]
      );
    default:
  }
  nodeStack.pop();
}

function freevarsMain(node) {
  genid = makeGensym();
  boundVarsStack = [];
  freeVarsStack = [];
  nodeStack = [];

  return replace(node, { enter: enter, leave: exit });
}

module.exports = {
  freevars: freevarsMain
};
