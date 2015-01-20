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
var ntypes = types.namedTypes;
var Syntax = estraverse.Syntax;

var cps = require("./cps").cps;
var optimize = require("./optimize").optimize;
var naming = require("./naming").naming;
var store = require("./store").store;


Object.prototype.refines = function( x ) {
    throw new Error( "object does not refine" );
}

Object.prototype.join = function( x ) {
    throw new Error( "object does not join" );
}

function Lat() {}

Lat.prototype.refines = function( x ) {
    throw new Error( "refines unimplemented" );
}

Lat.prototype.join = function( x ) {
    throw new Error( "join unimplemented" );
}

Lat.prototype.equals = function( x ) {
    return this.refines( x ) && x.refines( this );
}


function Top() {}

Top.prototype = new Lat();

Top.top = new Top();

function Pair( car, cdr ) {
    this.car = car;
    this.cdr = cdr;
}

Pair.prototype = new Lat();

Pair.prototype.refines = function( x ) {
    return ( x instanceof Pair )
	&& this.car.refines( x.car )
	&& this.cdr.refines( x.cdr );
}

Pair.prototype.join = function( x ) {
    return ( x instanceof Pair )
	? new Pair( this.car.join( x.car ), this.cdr.join( x.cdr ) )
	: Top.top;
}

function Set( xs ) {
    this.xs = xs || [];
}

Set.prototype = new Lat();

Set.singleton = function( x ) {
    return new Set([x]);
}
				     
Set.prototype.member = function( x ) {
    for( var i = 0; i < this.xs.length; ++i ) {
	if( x.refines( this.xs[i] ) ) {
	    return true;
	}
    }

    return false;
}

Set.prototype.add = function( x ) {
    if( ! this.member( x ) ) {
	this.xs.push( x );
    }
}

Set.prototype.pop = function() {
    return this.xs.pop();
}

Set.prototype.empty = function() {
    return ( this.xs.length === 0 );
}

Set.prototype.refines = function( ys ) {
    if( ys instanceof Set ) {
	return this.xs.every( function( x ) {
	    return ys.member( x );
	});
    }
    else return false;
}

Set.prototype.join = function( s ) {
    if( s instanceof Set ) {
	var t = new Set( this.xs.concat() );

	s.xs.forEach( function( x ) {
	    t.add( x );
	});

	return t;
    }
    else return Top.top;
}

function Bot() {}

Bot.prototype = new Lat();

Bot.bot = new Bot();

Bot.prototype.refines = function( x ) {
    return true;
}

Bot.prototype.join = function( x ) {
    return x;
}

function Entry( key, value ) {
    this.key = key;
    this.value = value;
}

function Map() {}

Map.prototype = new Lat();

Map.prototype.refines = function( x ) {
    if( x instanceof Map ) {
	for( var p in this ) {
	    if( this.hasOwnProperty( p )
		&& ( ! x.hasOwnProperty( p ) )
		|| ( ! this[p].refines( x[p] ) ) ) {
		return false;
	    }
	}

	return true;
    }
    else return false;
}

Map.prototype.extend = function( k, v ) {
    this[k] = ( this[k] || Bot.bot ).join( v );
}

function Hash() {
    this.xs = [];
}

Hash.prototype.get = function( k ) {
    var v = Bot.bot;

    for( var i = 0; i < this.xs.length; ++i ) {
	if( k.refines( this.xs[i].key ) ) {
	    v = v.join( this.xs[i].value );
	}
    }

    return v;
}

Hash.prototype.set = function( k, v ) {
    var i = 0;

    while( i < this.xs.length && ( ! k.refines( this.xs[i].key ) ) ) {
	++i;
    }

    if( i < this.xs.length ) {
	this.xs[i].value = this.xs[i].value.join( v );
    }
    else {
	this.xs.push( new Entry( k, v ) );
    }
}

Hash.prototype.refines = function( d ) {
    return ( d instanceof Hash )
	&& this.xs.every( function( entry ) {
	    return entry.value.refines( d.get( entry.key ) );
	});
}

/*Hash.prototype.join = function( d ) {
    if( d instanceof Bottom ) {
	return this;
    }
    else if( d instanceof Hash ) {
*/	

/*function Timestamp( t ) {
    this.t = t;
}

Timestamp.prototype.refines = Top.embed( function( t ) {
    return ( t instanceof Timestamp )
	&& this.t < t.t;
});

Timestamp.prototype.increment = function() {
    return new Timestamp( this.t );
}
*/

function Au( e, environment, astore ) {
    switch( e.type ) {
    case Syntax.Literal:
	return e.value;
    default:
	throw new Error( "unimplemented Au" );
    }
}

function fail( message, node ) {
    return function() {
	console.log( node );
	throw new Error( message );
    }
}

function destructFuncDec( node, success, fail ) {
    if( ntypes.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	ntypes.FunctionExpression.check( node.declarations[0].init ) ) {
	return success( node.declarations[0].id.name, node.declarations[0].init );
    }
    else return fail();
}

function destructNameAssgn( node, success, fail ) {
    if( ntypes.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	( node.declarations[0].init.callee.object.name === "address" ) &&
	( node.declarations[0].init.callee.property.name === "concat" ) ) {
	return success( node.declarations[0].init.arguments[0].value );
    }
    else return fail();
}

function isContinuationCall( call ) {
    return ( call.arguments.length === 1 );
    
    /*assumes k is passed as parameter
      return ( ntypes.Identifier.check( call.callee ) && ( call.callee.name === k.name ) )
	|| ( ntypes.FunctionExpression.check( call.callee ) && ( call.callee.arguments.length === 1 ) );*/
}

function destructContCall( node, success, fail ) {
    if( ntypes.ExpressionStatement.check( node ) &&
	ntypes.CallExpression.check( node.expression ) &&
	isContinuationCall( node.expression ) ) {
	return success( node.expression.callee, node.expression.arguments[0] );
    }
    else return fail();
}

function destructUserCall( node, success, fail ) {
    if( ntypes.ExpressionStatement.check( node ) &&
	ntypes.CallExpression.check( node.expression ) &&
	( ! isContinuationCall( node.expression ) ) ) {
	return success( node.expression.callee, node.expression.arguments.slice(2), node.expression.arguments[0] );
    }
    else fail();
}

function makeUEval( astore, label ) {
    return function( callee, args, k ) {
	if( ntypes.Identifier.check( k ) ) {
	    return new UEvalExit( astore, label, callee, args );
	}
	else {
	    return new UEvalCall( astore, label, callee, args, k );
	}
    }
}

function UEvalCall( astore, label, callee, args, k ) {
    this.astore = astore;
    this.label = label;
    this.callee = callee;
    this.args = args;
    this.k = k;
}

function UEvalExit( astore, label, callee, args ) {
    this.astore = astore;
    this.label = label;
    this.callee = callee;
    this.args = args;
}

function makeCEval( astore ) {
    return function( cont, argument ) {
	if( ntypes.Identifier.check( cont ) ) {
	    return new CEvalExit( astore, argument );
	}
	else {
	    return new CEvalInner( astore, cont, argument );
	}
    }
}

function CEvalExit( astore, environment, argument ) {
    this.astore = astore;
    this.environment = environment;
    this.argument = argument;
}

CEvalExit.prototype.successors = function() {
    return [];
}

CEvalExit.prototype.refines = function( state ) {
    return ( state instanceof CEvalExit )
	&& ( this.astore.refines( state.astore ) )
	&& ( this.argument.refines( state.argument ) );
}

CEvalExit.prototype.evaluatedArgument = function() {
    return Au( this.argument, this.environment, this.astore );
}

function CEvalInner( astore, cont, argument ) {
    console.log( "CEvalInner" );
    assert( false );
}

function inject( node, k ) {
    assert( types.namedTypes.Program.check( node ) );

    function makeBoundsCheck( f, message ) {
	return function( xs, i, v ) {
	    if( i < xs.length ) {
		return f( xs, i, v );
	    }
	    else throw new Error( message );
	}
    }
    
    function FuncBody( stmts, i, astore ) {
	return destructNameAssgn( stmts[i], function( label ) {
	    return destructUserCall( stmts[i+1], makeUEval( astore, label ), fail( "expected a user call", stmts[i+1] ) );
	}, function() {
	    return destructContCall( stmts[i], makeCEval( astore ), fail( "expected a continuation call", stmts[i] ) );
	});
    }
    
    var FuncDecStar = makeBoundsCheck( function( stmts, i, astore ) {
	return destructFuncDec( stmts[i], function( name, func ) {
	    astore[ name ] = Set.singleton( func );
	    
	    return FuncDecStar( stmts, i + 1, astore );
	}, function() {
	    return FuncBody( stmts, i, astore );
	});
    }, "FuncDecStar went to end" );

    var state = FuncDecStar( node.body, 0, {} );

    state.isInitial = true;

    return state;
}

// expects an AST of a named, CPS'd, storified program
function analyzeMain( node, k ) {
    //console.log( escodegen.generate( node ) );
    
    var seen = new Set(), work = new Set(), summaries = new Hash(),
	callers = new Hash(), tcallers = new Hash(), finals = new Set();

    var init = inject( node, k );

    work.add( new Pair( init, init ) );

    while( ! work.empty() ) {
	var states = work.pop();

	if( states.cdr instanceof CEvalExit ) {
	    if( states.car.isInitial ) {
		finals.add( states.cdr.evaluatedArgument() );
	    }
	    else {
		throw new Error( "Not implemented 1" );
	    }
	}
	else if( states.cdr instanceof UEvalCall ) {
	    var succs = states.cdr.succs();

	    for( var i = 0; i < succs.length; ++i ) {
		propagate( succs[i], succs[i] );
		callers.set( new Pair( states.cdr, succs[i] ), states.car );
		summary.get( succs[i] )
		new Triple( states.car, states.cdr, succs[i] );		
	    }
	}
	else {
	    throw new Error( "Not implemented 2" );
	}
    }

    return finals;
}




module.exports = {
analyze: analyzeMain
};
