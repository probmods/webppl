"use strict";

var estraverse = require("estraverse");

var traverse = estraverse.traverse;
var Syntax = estraverse.Syntax;

function analyzeRefs( node, k ) {
    var stack = Object.create({
	add: function( x ) {
	    this.fs[this.fs.length-1].push( x );
	},
	contains: function( x ) {
	    return this.fs[this.fs.length-1].indexOf( x ) !== -1;
	},
	push: function() {
	    this.fs.push([]);
	},
	pop: function() {
	    this.fs.pop();
	}
    }, {
	fs: {
	    value: []
	}
    });

    var heapRefs = {};

    stack.push();
    stack.add( k );
    
    traverse( node, {
	enter: function( node, parent ) {
	    switch( node.type ) {
	    case Syntax.Identifier:
		if( stack.contains( node.name ) ) {
		    node.heapRef = false;
		}
		else {
		    node.heapRef = true;
		    heapRefs[ node.name ] = true;
		}
		break;
	    case Syntax.FunctionExpression:
		if( node.params.length > 1 ) {
		    stack.push();
		}

		node.params.forEach( function( param ) {
		    stack.add( param.name );
		});

		break;
	    case Syntax.VariableDeclarator:
		stack.add( node.id.name );
		break;
	    default:
	    }
	},
	exit: function( node, parent ) {
	    switch( node.type ) {
	    case Syntax.FunctionExpression:
		if( node.params.length > 1 ) {
		    stack.pop();
		}
		break;
	    default:
	    }
	},
	keys: {
	    FunctionExpression: ["body"],
	    ObjectExpression: ["object"],
	    VariableDeclarator: ["init"]
	}
    });

    stack.pop();

    return function( x ) {
	return heapRefs[ x ] || false;
    }
}

exports.analyzeRefs = analyzeRefs;
