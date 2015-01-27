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

function cpsSequence( nodes, i, k ) {
    if( i === nodes.length ) {
	return cps( build.identifier("undefined"), k );
    }
    else if( i + 1 === nodes.length ) {
	return match( nodes[i], [
	    clause( Syntax.BlockStatement, function( body ) {
		return cpsSequence( body, 0, k );
	    }),
	    clause( Syntax.EmptyStatement, function() {
		return cps( build.identifier("undefined"), k );
	    }),
	    clause( Syntax.ExpressionStatement, function( expression ) {
		return cps( expression, k );
	    }),
	    clause( Syntax.IfStatement, function( test, consequent, alternate ) {
		return bindContinuation( k, function( k ) { // most likely unnecessary
		    return atomize( test, function( test ) {
			return build.conditionalExpression( test,
							    cpsSequence( consequent.body, 0, k ),
							    cpsSequence( alternate.body, 0, k ) );
		    });
		});
	    }),
	    clause( Syntax.ReturnStatement, function( argument ) {
		return cps( argument, k );
	    }),
	    clause( Syntax.VariableDeclaration, function( declarations ) {
		return cpsDeclarations( declarations, 0, function( id ) {
		    return buildContinuation( id, cpsSequence( nodes, i + 1, k ) );
		});
	    })], fail( "last one", nodes[i] ) );
    }
    else {
	return match( nodes[i], [
	    clause( Syntax.BlockStatement, function( body ) {
		return cpsSequence( body, 0, buildContinuation( genvar("dummy"), cpsSequence( nodes, i + 1, k ) ) );
	    }),
	    clause( Syntax.EmptyStatement, function() {
		return cpsSequence( nodes, i + 1, k );
	    }),
	    clause( Syntax.ExpressionStatement, function( expression ) {
		return cps( expression, buildContinuation( genvar("dummy"), cpsSequence( nodes, i + 1, k ) ) );
	    }),
	    clause( Syntax.IfStatement, function( test, consequent, alternate ) {
		return bindContinuation( k, function( k ) { // most likely unnecessary
		    return atomize( test, function( test ) {
			return build.conditionalExpression( test,
							    cpsSequence( consequent.body, 0, k ),
							    cpsSequence( alternate.body, 0, k ) );
		    });
		});
	    }),
	    clause( Syntax.ReturnStatement, function( argument ) {
		return cps( argument, k );
	    }),
	    clause( Syntax.VariableDeclaration, function( declarations ) {
		return cpsDeclarations( declarations, 0, function( id ) {
		    return buildContinuation( id, cpsSequence( nodes, i + 1, k ) );
		});
	    })], fail( "unknown deal", nodes[i] ) );
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

