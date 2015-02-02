"use strict";

var assert = require('assert');
var estraverse = require("estraverse");
var types = require("ast-types");
var util = require('./util.js');

var build = types.builders;
var Syntax = estraverse.Syntax;

var gensym = util.makeGensym();

var match = require("./util2").match;
var clause = require("./util2").clause;
var fail = require("./util2").fail;
var functor = require("./util2").functor;

var linearize = require("./linearize").linearize;

var isPrimitive = require("./util2").isPrimitive;
var makeGenvar = require("./util2").makeGenvar;

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
      convertToStatement(cps(node.body, newCont))
    );
  case Syntax.Identifier:
  case Syntax.Literal:
    return node;
  case Syntax.EmptyStatement:
    return build.identifier("undefined");
  default:
    throw new Error("cpsAtomic: unknown expression type: " + node.type);
  }
}

function buildFunction( params, body, id ) {
    return build.functionExpression( id || null, params,
				     build.blockStatement([ build.expressionStatement( body ) ]) );
}

function cpsCompoundApplication(opNode, argNodes, cont){
  var nodes = [opNode].concat(argNodes);
  return cpsSequence(
    function (nodes){return (nodes.length === 0);},
    function(nodes, vars){
      var args = [cont].concat(vars.slice(1));
      return build.callExpression(vars[0], args);
    },
    nodes);
}

function buildContinuation( param, body ) {
    return buildFunction( [ param ], body );
}

function buildContinuationCall( callee, arg ) {
    return buildCall( callee, [ arg ] );
}

function cpsBinaryExpression(opNode, leftNode, rightNode, cont){
  var nodes = [leftNode, rightNode];
  return cpsSequence(
    function(nodes){return (nodes.length === 0);},
    function(nodes, vars){
      assert.equal(vars.length, 2);
      return buildContinuationCall(
        cont,
        build.binaryExpression(opNode, vars[0], vars[1]));
    },
    nodes);
}

function cpsLogicalExpression(lopNode, leftNode, rightNode, cont){
  var nodes = [leftNode, rightNode];
  return cpsSequence(
    function(nodes){return (nodes.length === 0);},
    function(nodes, vars){
      assert.equal(vars.length, 2);
      return buildContinuationCall(
        cont,
        build.logicalExpression(lopNode, vars[0], vars[1]));
    },
    nodes);
}

function isAtomic( node ) {
    switch( node.type ) {
    case Syntax.ArrayExpression:
	return node.elements.every( isAtomic );
    case Syntax.BinaryExpression:
	return isAtomic( node.left ) && isAtomic( node.right );
    case Syntax.CallExpression:
	return isPrimitive( node.callee ) && node.arguments.every( isAtomic );
    case Syntax.ConditionalExpression:
	return isAtomic( node.test ) && isAtomic( node.consequent ) && isAtomic( node.alternate );
    case Syntax.FunctionExpression:
    case Syntax.Identifier:
    case Syntax.Literal:
	return true;
    case Syntax.MemberExpression:
	return isAtomic( node.object ) && isAtomic( node.property );
    case Syntax.ObjectExpression:
	return node.properties.every( function( property ) {
	    return isAtomic( property.key ) && isAtomic( property.value );
	});
    case Syntax.UnaryExpression:
	return isAtomic( node.argument );
    default:
	console.log( node );
	console.log( "isAtomic" );
	throw "isAtomic";
    }
}

function atomize( node, K ) {
    if( isAtomic( node ) ) {
	switch( node.type ) {
	case Syntax.FunctionExpression:
	    return K( cpsFunction( node.id, node.params, node.body ) );
	default:
	    return K( node );
	}
    }
    else {
	switch( node.type ) {
	case Syntax.BinaryExpression:
	case Syntax.CallExpression:
	    var x = genvar("result");
	    return cps( node, buildContinuation( x, K( x ) ) );
	case Syntax.MemberExpression:
	    return atomize( node.object, function( object ) {
		return atomize( node.property, function( property ) {
		    return K( build.memberExpression( object, property, node.computed ) );
		});
	    });
	default:
	console.log( node );
	console.log( "atomize" );
	throw "atomize";
	}
    }
}

function cpsObjectExpression(properties, cont, props){
  props = props || [];
  if (properties.length === 0 ) {
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
  var objName, memberExpr;
  if (computed) {
    objName = makeGensymVariable("obj");
    var propName = makeGensymVariable("prop");
    memberExpr = build.memberExpression(objName, propName, computed);
    return cps(obj,
               buildFunc([objName],
                         cps(prop,
                             buildFunc([propName],
                                       buildContinuationCall(cont, memberExpr)))));
  } else {
    objName = makeGensymVariable("obj");
    memberExpr = build.memberExpression(objName, prop, false);
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

  case Syntax.ReturnStatement:
    return cps(node.argument, cont);

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

function cpsMain(node){
    gensym = util.makeGensym();

    return inProgram( node, function( expression ) {
	return clause( Syntax.FunctionExpression, function( id, params, defaults, rest, body ) {
	    return cpsFunction( id, params, body );
	})( expression, fail( "cps: expected FunctionExpression", expression ) );
    }, fail( "cps: inProgram", node ) );
}

module.exports = {
  cps: cpsMain
};

