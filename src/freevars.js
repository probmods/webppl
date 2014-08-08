"use strict";

var assert = require('assert');
var _ = require('underscore');
var estraverse = require("estraverse");
var types = require("ast-types");

var Syntax = estraverse.Syntax;

var getName = function(x){
  return x.name;
};

var freeVarsSeq = function(nodes, bound){
  var boundInSeq = bound.slice();
  var freeInSeq = [];
  _.each(nodes, function(node){
           freeInSeq = freeInSeq.concat(freeVars(node, boundInSeq));
           if (types.namedTypes.VariableDeclaration.check(node)) {
             boundInSeq.push(node.declarations[0].id);
           }
         });
  return freeInSeq;
};

function freeVars(node, bound){

  switch (node.type){

  case Syntax.BlockStatement:
  case Syntax.Program:
    return freeVarsSeq(node.body, bound);

  case Syntax.ReturnStatement:
    return freeVars(node.argument, bound);

  case Syntax.ExpressionStatement:
    return freeVars(node.expression, bound);

  case Syntax.Identifier:
    return [node.name];

  case Syntax.Literal:
  case Syntax.EmptyStatement:
    return [];

  case Syntax.FunctionExpression:
    return freeVars(node.body, bound.concat(_.map(node.params, getName)));

  case Syntax.VariableDeclaration:
    return freeVars(node.declarations[0].init, bound.concat([node.declarations[0].id]));

  case Syntax.CallExpression:
    return _.flatten(
      [freeVars(node.callee, bound)].concat(
        _.map(node.arguments,
              function(n){return freeVars(n, bound);})),
      true);

  case Syntax.ConditionalExpression:
    return _.flatten(
      _.map([node.test, node.consequent, node.alternate],
            function(n){return freeVars(n, bound);}),
      true);

  case Syntax.ArrayExpression:
    return _.flatten(_.map(node.elements,
                           function(n){return freeVars(n, bound);}));

  case Syntax.MemberExpression:
    // FIXME: this is not correct in general (but we care about free
    // proc vars...)
    return [];

  default:
    throw new Error("freeVars: unknown node type: " + node.type);
  }
};

function freeVarsTop(node){
  return freeVars(node, []);
}


module.exports = {
  freeVars: freeVarsTop
}
