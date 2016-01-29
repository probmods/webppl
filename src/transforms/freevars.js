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

var literalIdentifiers = {
  undefined: true,
  NaN: true,
  Infinity: true
};

function identifierIsVar(node, parent) {
  // esprima represents some special literals as Identifer nodes; skip those
  if (literalIdentifiers[node.name]) return false;
  // exprima also represents non-computed object member access with an
  //    Identifer node, so skip those as well.
  if (parent.type === Syntax.MemberExpression && !parent.computed &&
      node === parent.property) return false;
  // Property keys in object literal expressions are also Identifer nodes
  if (parent.type === Syntax.Property && node === parent.key) return false;
  return true;
}

function enter(node, parent) {
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
      if (boundVarsStack.length > 0 && identifierIsVar(node, parent)) {
        // If the Identifier isn't already bound, then it's a free var
        if (!boundVarsStack[boundVarsStack.length - 1][node.name])
          freeVarsStack[freeVarsStack.length - 1][node.name] = true;
      }
      break;
    default:
  }
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
      var wrappedFn = build.callExpression(
          build.memberExpression(build.identifier('_Fn'),
          build.identifier('tag'), false),
          [node, build.literal(genid(0)), build.arrayExpression(freeVarNodes)]
          );
      // Also, if we're exiting a nested function, add all free variables of
      //    that function to the outer function (if they are not bound in
      //    the outer function)
      if (freeVarsStack.length > 0) {
        var outerFreeVars = freeVarsStack[freeVarsStack.length - 1];
        var outerBoundVars = boundVarsStack[boundVarsStack.length - 1];
        for (var name in freeVars) {
          if (outerBoundVars[name] === undefined)
            outerFreeVars[name] = true;
        }
      }
      return wrappedFn;
    default:
  }
}

function freevarsMain(node) {
  genid = makeGensym();
  boundVarsStack = [];
  freeVarsStack = [];

  return replace(node, { enter: enter, leave: exit });
}

module.exports = {
  freevars: freevarsMain
};
