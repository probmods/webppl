'use strict';

var replace = require("estraverse").replace;
var Syntax = require("estraverse").Syntax;
var build = require("ast-types").builders;
var types = require("ast-types").namedTypes;

var parse = require("esprima").parse;

var functor = require("./util2").functor;
var isPrimitive = require("./util2").isPrimitive;

function thunkify( node ) {
    return build.functionExpression(
	null, [],
	build.blockStatement([
	    build.returnStatement(node)
	]), false, false );
}

function skip( node ) {
    if( types.ReturnStatement.check( node ) ) {
	this.skip();
    }
}

function trampoline( node ) {
  switch( node.type ) {

  // re-direct all non-primitive calls through trampoline
  // this is only okay in cps where no implicit stack is used!
  case Syntax.ExpressionStatement:
      switch( node.expression.type ) {
      case Syntax.CallExpression:
	  if( isPrimitive( node.expression.callee ) ) {
	      return node;
	  }
	  else {
	      return build.returnStatement( thunkify( node.expression ) );
	  }
      default:
	  return build.returnStatement( thunkify( node.expression ) );
      }
  default:
    return node;
  }
}

var driver = parse("\
(function( p ) {\n\
  return function( s, k, a ) {\n\
    var trampoline = p( s, k, a );\n\
\n\
    while( trampoline ) {\n\
      trampoline = trampoline();\n\
    }\n\
  }\n\
})").body[0].expression;

function trampolineMain( node ) {
    return functor( node, function( node ) {
	return build.callExpression( driver, [replace( node, {
	    enter: skip,
	    leave: trampoline
	})] );
    });
}

module.exports = {
  trampoline: trampolineMain
};
