"use strict";

var assert = require('assert');
var _ = require('underscore');
var estraverse = require("estraverse");
var escodegen = require("escodegen");
var esprima = require("esprima");
var estemplate = require("estemplate");
var types = require("ast-types");
var util = require('./util.js');

var build = types.builders;
var Syntax = estraverse.Syntax;

var returnContIdentifier = build.identifier("_return");

var gensym = util.makeGensym();

function makeGensymVariable(name){
  return build.identifier("_".concat(gensym(name)));
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

function buildFunc(args, body){
  if (types.namedTypes.BlockStatement.check(body)) {
    return build.functionExpression(null, args, body);
  } else {
    return build.functionExpression(null, args, build.blockStatement(
      [convertToStatement(body)]));
  }
}

function buildContinuationCall(cont, value){
  return build.callExpression(cont, [value]);
}

function cpsAtomic(node){
  switch (node.type) {
  case Syntax.FunctionExpression:
    var newCont = makeGensymVariable("k");
    var newParams = [newCont].concat(node.params);
    return buildFunc(
      newParams,
      build.blockStatement([
        build.variableDeclaration("var", [build.variableDeclarator(returnContIdentifier, newCont)]),
        convertToStatement(cps(node.body, newCont))
      ]));
  case Syntax.Identifier:
  case Syntax.Literal:
    return node;
  case Syntax.EmptyStatement:
    return build.identifier("undefined");
  default:
    throw new Error("cpsAtomic: unknown expression type: " + node.type);
  };
}

function cpsSequence(atFinalElement, getFinalElement, nodes, vars){
  vars = vars || [];
  if (atFinalElement(nodes)){
    return getFinalElement(nodes, vars);
  } else if(isImmediate(nodes[0])) {
    //    var val = immediateVal(nodes[0])
    return cpsSequence(atFinalElement,
                       getFinalElement,
                       nodes.slice(1),
                       vars.concat([nodes[0]]));
  } else if ((nodes[0].type == Syntax.VariableDeclaration) &&
             !isFunctionDeclaration(nodes[0])){
    assert.equal(nodes[0].declarations.length, 1);
    var declaration = nodes[0].declarations[0];
    return cps(declaration.init,
               buildFunc([declaration.id],
                         cpsSequence(atFinalElement,
                                     getFinalElement,
                                     nodes.slice(1),
                                     vars.concat([declaration.id]))));
  } else {
    var nextVar = makeGensymVariable("s");
    return cps(nodes[0],
               buildFunc([nextVar],
                         cpsSequence(atFinalElement,
                                     getFinalElement,
                                     nodes.slice(1),
                                     vars.concat([nextVar]))));
  }
}

function isImmediate(node) {
  return node.type == Syntax.Literal || node.type == Syntax.Identifier;
}

function isFunctionDeclaration(node){
  return (types.namedTypes.VariableDeclaration.check(node) &&
          types.namedTypes.FunctionExpression.check(node.declarations[0].init));
}

function cpsBlock(nodes, cont){

  if ((nodes.length > 1) && isFunctionDeclaration(nodes[0])){
    // Function declarations that occur as the first nodes in a block
    // will be assigned within the same scope that the block
    // occurs. This allows us to define functions at the top-level scope.
    var node = nodes[0];
    var newBlockElementNode;
    assert.equal(node.declarations.length, 1);
    var declaration = node.declarations[0];
    newBlockElementNode = build.variableDeclaration(
      "var", [build.variableDeclarator(declaration.id, cpsAtomic(declaration.init))]);
    var newRemainderNode = cpsBlock(nodes.slice(1), cont);
    if (types.namedTypes.BlockStatement.check(newRemainderNode)){
      // Flatten nested block
      return build.blockStatement([newBlockElementNode].concat(newRemainderNode.body));
    } else {
      return build.blockStatement([newBlockElementNode, convertToStatement(newRemainderNode)]);
    }

  } else {
    // FIXME: the sequence vars are going to be ignored (but will also
    // be removed by optimizer)
    return cpsSequence(
      function (nodes){return (nodes.length == 1);},
      function(nodes, vars){
        return cps(nodes[0], cont);
      },
      nodes);
  }
}

// we assume that a function called as a method is primitive (a hack,
// for simplicity). have to wrap up the object in case it's compound.
function cpsPrimitiveApplicationMember(opNode, argNodes, cont){
  var objNode = opNode.object;
  var nodes = [objNode].concat(argNodes);
  return cpsSequence(
    function (nodes){return (nodes.length == 0);},
    function(nodes, vars){
      var memberNode = build.memberExpression(vars[0], opNode.property, opNode.computed);
      return buildContinuationCall(
        cont,
        build.callExpression(memberNode, vars.slice(1)));
    },
    nodes);
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
    return cpsPrimitiveApplicationMember(opNode, argNodes, cont);
  } else {
    return cpsCompoundApplication(opNode, argNodes, cont);
  }
}

function cpsUnaryExpression(opNode, argNode, isPrefix, cont){
  var nodes = [argNode];
  return cpsSequence(
    function(nodes){return (nodes.length == 0);},
    function(nodes, vars){
      return buildContinuationCall(
        cont,
        build.unaryExpression(opNode, vars[0], isPrefix));
    },
    nodes);
}

function cpsBinaryExpression(opNode, leftNode, rightNode, cont){
  var nodes = [leftNode, rightNode];
  return cpsSequence(
    function(nodes){return (nodes.length == 0);},
    function(nodes, vars){
      assert.ok(vars.length == 2);
      return buildContinuationCall(
        cont,
        build.binaryExpression(opNode, vars[0], vars[1]));
    },
    nodes);
}

function cpsLogicalExpression(lopNode, leftNode, rightNode, cont){
  var nodes = [leftNode, rightNode];
  return cpsSequence(
    function(nodes){return (nodes.length == 0);},
    function(nodes, vars){
      assert.ok(vars.length == 2);
      return buildContinuationCall(
        cont,
        build.logicalExpression(lopNode, vars[0], vars[1]));
    },
    nodes);
}

function cpsConditional(test, consequent, alternate, cont){
  // bind continuation to avoid code blowup
  var contName = makeGensymVariable("k");
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
  var contName = makeGensymVariable("k");
  var testName = makeGensymVariable("test");
  var consequentNode = cps(consequent, contName);
  if (alternate === null) {
    var alternateNode = buildContinuationCall(contName, build.identifier("undefined"));
  } else {
    var alternateNode = cps(alternate, contName);
  }
  return build.callExpression(
    buildFunc([contName],
              cps(test,
                  buildFunc([testName],
                            build.ifStatement(
                              testName,
                              convertToStatement(consequentNode),
                              convertToStatement(alternateNode))))),
    [cont]
  );
}

function cpsArrayExpression(elements, cont){
  return cpsSequence(
    function (nodes){return (nodes.length == 0);},
    function(nodes, vars){
      var arrayExpr = build.arrayExpression(vars);
      return buildContinuationCall(cont, arrayExpr);
    },
    elements);
}

function cpsObjectExpression(properties, cont, props){
  props = props || [];
  if (properties.length == 0 ) {
    var objectExpr = build.objectExpression(props);
    return buildContinuationCall(cont, objectExpr);
  } else {
    var nextVal = makeGensymVariable("ob");
    var nextProp = build.property(properties[0].kind, properties[0].key, nextVal);
    // FIXME: assert that value is not function, since can't call function methods...?
    return cps(properties[0].value,
               buildFunc([nextVal],
                         cpsObjectExpression(properties.slice(1),
                                             cont,
                                             props.concat([nextProp]))));
  }
}

function cpsMemberExpression(obj, prop, computed, cont){
  if (computed) {
    var objName = makeGensymVariable("obj");
    var propName = makeGensymVariable("prop");
    var memberExpr = build.memberExpression(objName, propName, computed);
    return cps(obj,
               buildFunc([objName],
                         cps(prop,
                             buildFunc([propName],
                                       buildContinuationCall(cont, memberExpr)))));
  } else {
    var objName = makeGensymVariable("obj");
    var memberExpr = build.memberExpression(objName, prop, false);
    return cps(obj,
               buildFunc([objName],
                         buildContinuationCall(cont, memberExpr)));
  }
}

function cpsVariableDeclaration(declarationId, declarationInit, cont){
  if (types.namedTypes.FunctionExpression.check(declarationInit)){
    return build.blockStatement(
      [
        build.variableDeclaration(
          "var",
          [build.variableDeclarator(declarationId, cpsAtomic(declarationInit))]),
        convertToStatement(buildContinuationCall(cont, build.identifier("undefined")))
      ]);
  } else {
    return cps(declarationInit,
               buildFunc([declarationId],
                         buildContinuationCall(cont, build.identifier("undefined"))));
  }
}

function cpsAssignmentExpression(operator, left, right, cont) {
  //cps the right side (and left??), make assignment, call cont with assignment result.
  assert.equal(left.type,Syntax.MemberExpression, "Assignment is allowed only to fields of globalStore.");
  assert.equal(left.object.name,"globalStore", "Assignment is allowed only to fields of globalStore.");
  var rhsName = makeGensymVariable("rhs");
  var assignmentExpr = build.assignmentExpression(operator, left, rhsName);
  return cps(right, buildFunc([rhsName],
                              buildContinuationCall(cont, assignmentExpr)));
}

function cps(node, cont){

  switch (node.type) {

  case Syntax.BlockStatement:
    return cpsBlock(node.body, cont);

  case Syntax.Program:
    return build.program([convertToStatement(cpsBlock(node.body, cont))]);

  case Syntax.ReturnStatement:
    return cps(node.argument, returnContIdentifier);

  case Syntax.ExpressionStatement:
    return cps(node.expression, cont);

  case Syntax.EmptyStatement:
  case Syntax.Identifier:
  case Syntax.Literal:
  case Syntax.FunctionExpression:
    return buildContinuationCall(cont, cpsAtomic(node));

  case Syntax.VariableDeclaration:
    assert.equal(node.declarations.length, 1);
    var declaration = node.declarations[0];
    return cpsVariableDeclaration(declaration.id, declaration.init, cont);

  case Syntax.CallExpression:
    return cpsApplication(node.callee, node.arguments, cont);

  case Syntax.IfStatement:
    return cpsIf(node.test, node.consequent, node.alternate, cont);

  case Syntax.ConditionalExpression:
    return cpsConditional(node.test, node.consequent, node.alternate, cont);

  case Syntax.ArrayExpression:
    return cpsArrayExpression(node.elements, cont);

  case Syntax.ObjectExpression:
    return cpsObjectExpression(node.properties, cont);

  case Syntax.MemberExpression:
    return cpsMemberExpression(node.object, node.property, node.computed, cont);

  case Syntax.UnaryExpression:
    return cpsUnaryExpression(node.operator, node.argument, node.prefix, cont);

  case Syntax.BinaryExpression:
    return cpsBinaryExpression(node.operator, node.left, node.right, cont);

  case Syntax.LogicalExpression:
    return cpsLogicalExpression(node.operator, node.left, node.right, cont);

  case Syntax.AssignmentExpression:
    return cpsAssignmentExpression(node.operator, node.left, node.right, cont);

  default:
    throw new Error("cps: unknown node type: " + node.type);
  }
}

function cpsMain(node, cont){
  gensym = util.makeGensym();
  return cps(node, cont);
}

module.exports = {
  cps: cpsMain
};
