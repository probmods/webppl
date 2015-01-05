'use strict';

var estraverse = require('estraverse');
var types = require('ast-types');
var esprima = require('esprima');

var build = types.builders;
var Syntax = estraverse.Syntax;

function thunkify( node ) {
    return build.functionExpression(
	null, [],
	build.blockStatement([
	    build.returnStatement(node)
	]), false, false );
}

function trampoline(node) {
  switch( node.type ) {

  // re-direct all non-primitive calls through trampoline
  // this is only okay in cps where no implicit stack is used!
  case Syntax.ExpressionStatement:
      switch( node.expression.type ) {
      case Syntax.CallExpression:
	  if( types.namedTypes.MemberExpression.check( node.expression.callee ) ) {
	      return node;
	  }
	  else {
	      return build.returnStatement( thunkify( node.expression ) );
	  }
      default:
	  return node;
      }
  default:
    return node;
  }
}


function trampolineMain( node ) {
    var driver = esprima.parse("\n\
(function( p ) {\n\
  return function( s, k, a ) {\n\
    var trampoline = p( s, k, a );\n\
\n\
    while( trampoline ) {\n\
      trampoline = trampoline();\n\
    }\n\
  }\n\
})").body[0].expression;

    node = estraverse.replace( node, {
	enter: function(n) {
	    if( types.namedTypes.ReturnStatement.check( n ) ) {
		this.skip();
	    }
	},
	leave: trampoline
    });

    return build.program([
	build.expressionStatement(
	    build.callExpression( driver, [node] ) ) ]);
}

module.exports = {
  trampoline: trampolineMain
};
