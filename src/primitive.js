"use strict";

var Syntax = require("estraverse").Syntax;
var types = require("ast-types").namedTypes;

function isPrimitive( node ) {
    switch( node.type ) {
    case Syntax.FunctionExpression:
    case Syntax.Identifier:
	return false;
    case Syntax.MemberExpression:
	return ( types.Identifier.check( node.object )
		 && node.object.name === "Math" )
	    || ( ! node.computed
		 && node.property.name === "concat" );
	    
    default:
	console.log( node );
	throw "isPrimitive doesn't handle node";
    }
}

exports.isPrimitive = isPrimitive;
