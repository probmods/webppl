"use strict";

var assert = require('assert');
var _ = require('underscore');
var estraverse = require("estraverse");
var escodegen = require("escodegen");
var esprima = require("esprima");
var estemplate = require("estemplate");
var types = require("ast-types");
var interset = require("interset");
var util = require('./util.js');

var difference = interset.difference;
var build = types.builders;
var Syntax = estraverse.Syntax;

function makeGensymVariable(name){
  return build.identifier("_".concat(util.gensym(name)));
}

function convertToStatement(node){
  if (types.namedTypes.Statement.check(node)) {
    return node;
  } else if (types.namedTypes.Expression.check(node)) {
    return build.expressionStatement(node);
  } else {
    throw new Error("convertToStatement: can't handle node type: " + node.type);
  }
}

// Generates function(){ stmt }()
function buildAppliedClosure(stmt){
  return build.callExpression(buildFunc([], stmt), []);
}

// FIXME: We don't always want to add a return statement
function buildFunc(args, body){
  if (types.namedTypes.BlockStatement.check(body)) {
    return build.functionExpression(null, args, body);
  } else {
    return build.functionExpression(null, args, build.blockStatement([buildReturn(body)]));
  }
}

function buildReturn(node){
  if (types.namedTypes.ExpressionStatement.check(node)) {
    return build.returnStatement(node.expression);
  } else if (types.namedTypes.Expression.check(node)) {
    return build.returnStatement(node);
  } else if (types.namedTypes.ReturnStatement.check(node)) {
    return node;
  } else if (types.namedTypes.Statement) {
    // Convert statement to expression
    return build.returnStatement(buildAppliedClosure(node));
  } else {
    throw new Error("buildReturn: can't handle node type: " + node.type);
  }
}

function cpsAtomic(node){
  // console.log("ATOMIC", node.type);
  switch (node.type) {
  case Syntax.FunctionExpression:
    var newCont = makeGensymVariable("k");
    var newParams = [newCont].concat(node.params);
    return buildFunc(newParams, cps(node.body, newCont));
  case Syntax.Identifier:
  case Syntax.Literal:
    return node;
  default:
    throw new Error("cpsAtomic: unknown expression type: " + node.type);
  };
}

function cpsSequence(atFinalElement, getFinalElement, nodes, vars){
  vars = vars || [];
  if (atFinalElement(nodes)){
    return getFinalElement(nodes, vars);
  } else {
    var nextVar = makeGensymVariable("s");
    return cps(nodes[0],
               buildFunc([nextVar],
                         cpsSequence(atFinalElement, getFinalElement, nodes.slice(1), vars.concat([nextVar]))));
  }
}

function cpsBlock(nodes, cont){
  return cpsSequence(
    function (nodes){return (nodes.length == 1);},
    function(nodes, vars){return cps(nodes[0], cont);},
    nodes);
}

function cpsPrimitiveApplication(opNode, argNodes, cont){
  return cpsSequence(
    function (nodes){return (nodes.length == 0);},
    function(nodes, vars){
      return build.callExpression(
        cont,
        [build.callExpression(opNode, vars)]);
    },
    argNodes);
}

function cpsCompoundApplication(opNode, argNodes, cont){
  var nodes = [opNode].concat(argNodes);
  return cpsSequence(
    function (nodes){return (nodes.length == 0);},
    function(nodes, vars){
      var args = [cont].concat(vars.slice(1));
      return build.callExpression(vars[0], args);
    },
    nodes);
}

function cpsApplication(opNode, argNodes, cont){
  if (types.namedTypes.MemberExpression.check(opNode)){
    return cpsPrimitiveApplication(opNode, argNodes, cont);
  } else {
    return cpsCompoundApplication(opNode, argNodes, cont);
  }
}

function cpsUnaryExpression(opNode, argNode, isPrefix, cont){
  var nodes = [argNode];
  return cpsSequence(
    function(nodes){return (nodes.length == 0);},
    function(nodes, vars){
      return build.callExpression(
        cont,
        [build.unaryExpression(opNode, vars[0], isPrefix)]);
    },
    nodes);
}

function cpsBinaryExpression(opNode, leftNode, rightNode, cont){
  var nodes = [leftNode, rightNode];
  return cpsSequence(
    function(nodes){return (nodes.length == 0);},
    function(nodes, vars){
      assert.ok(vars.length == 2);
      return build.callExpression(
        cont,
        [build.binaryExpression(opNode, vars[0], vars[1])]);
    },
    nodes);
}

function cpsConditional(test, consequent, alternate, cont){
  // bind continuation to avoid code blowup
  var contName = makeGensymVariable("cont");
  var testName = makeGensymVariable("test");
  return build.callExpression(
    buildFunc([contName],
      cps(test,
          buildFunc([testName],
                    build.conditionalExpression(testName,
                                                cps(consequent, contName),
                                                cps(alternate, contName))))),
    [cont]
  );
}

function cpsIf(test, consequent, alternate, cont){
  // bind continuation to avoid code blowup
  var contName = makeGensymVariable("cont");
  var testName = makeGensymVariable("test");
  return build.callExpression(
    buildFunc([contName],
      cps(test,
          buildFunc([testName],
          build.blockStatement([build.ifStatement(testName,
                                                  cps(consequent, contName),
                                                  cps(alternate, contName))])))),
    [cont]
  );
}

function cpsArrayExpression(elements, cont){
  return cpsSequence(
    function (nodes){return (nodes.length == 0);},
    function(nodes, vars){
      var arrayExpr = build.arrayExpression(vars);
      return build.callExpression(cont, [arrayExpr]);
    },
    elements);
}

function cpsMemberExpression(obj, prop, computed, cont){
    if (!computed) {
        var objName = makeGensymVariable("obj");
        var memberExpr = build.memberExpression(objName, prop, false);
        return cps(obj,
                   buildFunc([objName],
                             build.callExpression(cont, [memberExpr])));
    } else {
        var objName = makeGensymVariable("obj");
        var propName = makeGensymVariable("prop");
        var memberExpr = build.memberExpression(objName, propName, computed);
        return cps(obj,
                   buildFunc([objName],
                             cps(prop, buildFunc([propName], build.callExpression(cont, [memberExpr])))))
    }
}


function cpsVariableDeclaration(declarationId, declarationInit, cont){
  if (types.namedTypes.FunctionExpression.check(declarationInit)){
    return build.blockStatement(
      [
        build.variableDeclaration(
          "var",
          [build.variableDeclarator(declarationId, cpsAtomic(declarationInit))]),
        convertToStatement(build.callExpression(cont, [build.identifier("undefined")]))
      ]);
  } else {
    return cps(declarationInit,
               buildFunc([declarationId],
                         build.callExpression(cont, [build.identifier("undefined")])));
  }
}

function cps(node, cont){

  var recurse = function(nodes){return cps(nodes, cont);};

  // console.log(node.type);
  switch (node.type) {

  case Syntax.BlockStatement:
    return cpsBlock(node.body, cont);

  case Syntax.Program:
    return build.program([convertToStatement(cpsBlock(node.body, cont))]);

  case Syntax.ReturnStatement:
    return build.returnStatement(recurse(node.argument));

  case Syntax.ExpressionStatement:
    return build.expressionStatement(recurse(node.expression));

  case Syntax.Identifier:
  case Syntax.Literal:
  case Syntax.FunctionExpression:
    return build.callExpression(cont, [cpsAtomic(node)]);

  case Syntax.VariableDeclaration:
    assert.equal(node.declarations.length, 1);
    var declaration = node.declarations[0];
    return cpsVariableDeclaration(declaration.id, declaration.init, cont);

  case Syntax.CallExpression:
    return cpsApplication(node.callee, node.arguments, cont);

  case Syntax.EmptyStatement:
    return build.callExpression(cont, [build.identifier("undefined")]);

  case Syntax.IfStatement:
    return cpsIf(node.test, node.consequent, node.alternate, cont);

  case Syntax.ConditionalExpression:
    return cpsConditional(node.test, node.consequent, node.alternate, cont);

  case Syntax.ArrayExpression:
    return cpsArrayExpression(node.elements, cont);

  case Syntax.MemberExpression:
    return cpsMemberExpression(node.object, node.property, node.computed, cont);

  case Syntax.UnaryExpression:
    return cpsUnaryExpression(node.operator, node.argument, node.prefix, cont);

  case Syntax.BinaryExpression:
    return cpsBinaryExpression(node.operator, node.left, node.right, cont);

  default:
    throw new Error("cps: unknown node type: " + node.type);
  }
}

module.exports = {
  cps: cps
};
