"use strict";

var assert = require('assert');
var estraverse = require("estraverse");
var types = require("ast-types");

var build = types.builders;
var ntypes = types.namedTypes;
var Syntax = estraverse.Syntax;
var parse = require("./parser-combinator");
var analyzeRefs = require("./analyze-refs").analyzeRefs;

var isHeapVar = null;

Object.prototype.equals = function( x ) {
    if( this === x ) {
	return true;
    }
    else if( Object.getPrototypeOf( this ) === Object.getPrototypeOf( x ) ) {
	var ps0 = Object.getOwnPropertyNames( this ).sort(),
	    ps1 = Object.getOwnPropertyNames( x ).sort();

	if( ps0.length === ps1.length ) {
	    for( var i = 0; i < ps0.length; ++i ) {
		if( ( ps0[i] !== ps1[i] )
		    || ( this[ps0[i]] === null && x[ps0[i]] !== null )
		    || ( this[ps0[i]] !== null && x[ps0[i]] === null )
		    || ( ( this[ps0[i]] !== null && x[ps0[i]] !== null )
			 && ! this[ps0[i]].equals(x[ps0[i]]) ) ) {
		    return false;
		}
	    }
	}
	else return false;
    }
    else return false;
}

Boolean.prototype.equals = function( x ) {
    return this.valueOf() === x.valueOf();
}

Number.prototype.equals = function( x ) {
    return this.valueOf() === x.valueOf();
}

String.prototype.equals = function( x ) {
    return this.valueOf() === x.valueOf();
}

function Pair( car, cdr ) {
    this.car = car;
    this.cdr = cdr;
}

function Set( xs ) {
    this.xs = xs || [];
}

Set.singleton = function( x ) {
    return new Set([x]);
}
				     
Set.prototype.member = function( x ) {
    for( var i = 0; i < this.xs.length; ++i ) {
	if( x.equals( this.xs[i] ) ) {
	    return true;
	}
    }

    return false;
}

Set.prototype.add = function( x ) {
    if( ! this.member( x ) ) {
	this.xs.push( x );
	return true;
    }
    else return false;
}

Set.prototype.pop = function() {
    return this.xs.pop();
}

Set.prototype.size = function() {
    return this.xs.length;
}

Set.prototype.map = function( f ) {
    return this.xs.map( f );
}

Set.prototype.forEach = function( f ) {
    this.xs.forEach( f );
}

function Entry( key, value ) {
    this.key = key;
    this.value = value;
}

function Hash() {
    this.xs = [];
}

Hash.prototype.get = function( k, v ) {
    for( var i = 0; i < this.xs.length; ++i ) {
	if( k.equals( this.xs[i].key ) ) {
	    return this.xs[i].value;
	}
    }
    
    return v;
}

/*Hash.prototype.set = function( k, v ) {
    var i = 0;

    while( i < this.xs.length && ( ! k.equals( this.xs[i].key ) ) ) {
	++i;
    }

    if( i === this.xs.length ) {
	this.xs.push( new Entry( k, v ) );
    }
}*/

Hash.prototype.update = function( k, f, v ) {
    var i = 0;

    while( i < this.xs.length && ! this.xs[i].key.equals( k ) ) {
	++i;
    }

    if( i === this.xs.length ) {
	this.xs.push( new Entry( k, f( v ) ) );
    }
    else {
	this.xs[i].value = f( this.xs[i].value );
    }
}

function primitive( name ) {
    return Set.singleton({
	type: "Primitive",
	name: name
    });
}

var global = {
    bernoulliERP: {
	type: "Primitive",
	name: "bernoulliERP",
	sample: function() {
	    return build.literal( true );
	}
    },
    sample: Set.singleton({
	type: "Primitive",
	name: "sample",
	apply: function( erp ) {
	    return erp.sample();
	}
    })
};

function Au( store, environment, e ) {
    switch( e.type ) {
    case Syntax.Identifier:
	var v = environment[ e.name ] || store[ e.name ] || global[ e.name ];

	if( v ) {
	    return v;
	}
	else {
	    console.log( e );
	    throw new Error( "not found in environment" );
	}
    case Syntax.Literal:
	return Set.singleton( e.value );
    default:
	console.log( e );
	throw new Error( "unimplemented Au" );
    }
}

function fail( message, node ) {
    return function() {
	console.log( node );
	throw new Error( message );
    }
}

function foldsFuncDec( node, succeed, fail ) {
    if( ntypes.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	ntypes.FunctionExpression.check( node.declarations[0].init ) ) {
	return succeed( function( store ) {
	    store[ node.declarations[0].id.name ] = Set.singleton( node.declarations[0].init );
	    return store;
	});
    }
    else return fail();
}

function parseContBin( node, succeed, fail ) {
    if( ntypes.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	( node.declarations[0].id.name === "_return" ) ) {
	return succeed( node.declarations[0].init.name );
    }
    else return fail();
}

function foldsArguBin( node, succeed, fail ) {
    if( ntypes.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) ) {
	return succeed( function( environment ) {
	    environment[ node.declarations[0].id.name ] = Set.singleton( node.declarations[0].init );
	    return environment;
	});
    }
    else return fail();
}


function parseNameDec( node, succeed, fail ) {
    if( ntypes.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	ntypes.CallExpression.check( node.declarations[0].init ) &&
	ntypes.MemberExpression.check( node.declarations[0].init.callee ) &&
	( node.declarations[0].init.callee.object.name === "address" ) &&
	( node.declarations[0].init.callee.property.name === "concat" ) ) {
	return succeed( node.declarations[0].init.arguments[0].value );
    }
    else return fail();
}

function callbFuncExp( node, succeed, fail ) {
    if( ntypes.FunctionExpression.check( node ) ) {
	return succeed( function( f ) {
	    return f( node.params.slice(2).map( function( id ) {
		return id.name;
	    }), node.body );
	});
    }
    else return fail();
}

function isContinuationCall( call ) {
    return ( call.arguments.length === 1 );
}

function parseCEval( store, environment ) {
    return parse.bind( parse.single( parseContCall( store, environment ) ), parse.finish );
}

function parseContCall( store, environment ) {
    return function( node, succeed, fail ) {
	if( ntypes.ExpressionStatement.check( node ) &&
	    ntypes.CallExpression.check( node.expression ) &&
	    isContinuationCall( node.expression ) ) {
	    return succeed( makeCEval( store, environment, node.expression.callee, node.expression.arguments[0] ) );
	}
	else return fail();
    }
}

function makeCEval( store, environment, cont, argument ) {
    if( ntypes.Identifier.check( cont ) ) {
	return new CEvalExit( store, environment, argument );
    }
    else {
	return new CEvalInner( store, environment, cont, argument );
    }
}

function CEvalExit( store, environment, argument ) {
    this.store = store;
    this.environment = environment;
    this.argument = argument;
}

CEvalExit.prototype.succs = function() {
    return [];
}

CEvalExit.prototype.evaluatedArgument = function() {
    return Au( this.store, this.environment, this.argument );
}

function CEvalInner( store, cont, argument ) {
    console.log( "CEvalInner" );
    assert( false );
}

function parseUEval( store, environment ) {
    return parse.bind( parse.maybe( parse.single( parseContBin ), false ), function( k ) {
	return parse.bind( parse.star( parse.single( parse.not( parseNameDec ) ) ), function( dummies ) {
	    return parse.bind( parse.single( parseNameDec ), function( label ) {
		return parse.bind( parse.apply( parse.star( parse.single( foldsArguBin ) ), function( fs ) {
		    return fs.reduce( rapply, environment );
		}), function( environment ) {
		    return parse.bind( parse.single( parseUserCall( store, environment, label ) ), parse.finish )
		});
	    });
	});
    });
}

function parseUserCall( store, environment, label ) {
    return function( node, succeed, fail ) {
	if( ntypes.ExpressionStatement.check( node ) &&
	    ntypes.CallExpression.check( node.expression ) &&
	    ( ! isContinuationCall( node.expression ) ) ) {
	    return succeed( makeUEval( store, environment, label, node.expression.callee, node.expression.arguments.slice(2), node.expression.arguments[0] ) );
	}
	else fail();
    }
}

function makeUEval( store, environment, label, callee, args, k ) {
    if( ntypes.Identifier.check( k ) ) {
	return new UEvalExit( store, environment, label, callee, args );
    }
    else {
	return new UEvalCall( store, environment, label, callee, args, k );
    }
}

function UEvalCall( store, environment, label, callee, args, k ) {
    this.store = store;
    this.environment = environment;
    this.label = label;
    this.callee = callee;
    this.args = args;
    this.k = k;
}

UEvalCall.prototype.succs = function() {
    var store = this.store, environment = this.environment;
    
    var args = this.args.map( function( x ) {
	return Au( store, environment, x );
    });

    return Au( this.store, this.environment, this.callee ).map( evalthis( store, environment, args ) );
}


function UEvalExit( store, environment, label, callee, args ) {
    this.store = store;
    this.environment = environment;
    this.label = label;
    this.callee = callee;
    this.args = args;
}

function evalthis( store, environment, args ) {
    return function( f ) {
	switch( f.type ) {
	case "Primitive":
	    switch( f.name ) {
	    case "sample":
		return new CEvalExit( store, environment, f.apply( args[0] ) );
	    default:
		throw new Error( "primitive procedure not implemented" );
	    }
	default:
	    return new UApplyEntry( store, f, args );
	}
    }
}
    
UEvalExit.prototype.succs = function() {
    var store = this.store, environment = this.environment;
    
    var args = this.args.map( function( x ) {
	return Au( store, environment, x );
    });

    return Au( this.store, this.environment, this.callee ).map( evalthis( store, environment, args ) );
}

function UApplyEntry( store, f, args ) {
    this.store = store;
    this.f = f;
    this.args = args;
}

UApplyEntry.prototype.succs = function() {
    var store = this.store, args = this.args;
    
    return [callbFuncExp( this.f, function( f ) {
	return f( function( params, body ) {
	    var environment = {};

	    for( var i = 0; i < params.length; ++i ) {
		environment[ params[i] ] = args[i];
	    }

	    return parseBody( store, environment )( body.body, 0, id, fail( "failed to parse function body", body.body[3] ) );
	});
    }, fail( "expected a function expression here", this.f ))];
}

function rapply( x, f ) {
    return f( x );
}

function id( x ) {
    return x;
}

var parseBody = function( store, environment ) {
    return parse.or( parseCEval( store, environment ),
		     parseUEval( store, environment ) );
}

function inject( node, k ) {
    assert( types.namedTypes.Program.check( node ) );

    var parser = parse.bind( parse.apply( parse.star( parse.single( foldsFuncDec ) ), function( fs ) {
	return fs.reduce( rapply, {} );
    }), function( store ) {
	return parseBody( store, {} );
    });

    var state = parser( node.body, 0, id, fail( "uh oh", node ) );

    state.isInitial = true;

    return state;
}

function showEnv( e ) {
    return Object.getOwnPropertyNames( e ).toString();
}

function showArg( a ) {
    if( a.hasOwnProperty( "type" ) ) {
	switch( a.type ) {
	case Syntax.FunctionExpression:
	    return "lambda " + a.params.map( showArg ) + " -> ...";
	case Syntax.Identifier:
	    return a.name;
	case Syntax.Literal:
	    return a.value.toString();
	default:
	    console.log( a );
	    throw new Error( "unhandled argument type" );
	}
    }
    else if( a instanceof Set ) {
	return a.map( showArg );
    }
    else if( a.constructor.name === "Number" ) {
	return a.toString();
    }
    else {
	console.log( a.constructor );
	throw new Error( "unhandled argument" );
    }
}

function show( s ) {
    var name = s.constructor.name;

    switch( name ) {
    case "CEvalExit":
	return name + "(" + showEnv( s.environment ) + "," + showArg( s.argument ) + ")";
    case "UEvalExit":
	return name + "(" + showEnv( s.environment ) + "," + showArg( s.callee ) + "(" + s.args.map( showArg ) + "))^" + s.label;
    case "UApplyEntry":
	return name + "(" + showArg( s.f ) + "(" + s.args.map( showArg ) + "))";
    case "UEvalCall":
	return name + "(" + showEnv( s.environment ) + "," + showArg( s.callee ) + "(" + s.args.map( showArg ) + "," + showArg( s.k ) +  "))^" + s.label;
    default:
	throw new Error( "no show case for " + name );
    }
}

// expects an AST of a named, CPS'd program
function analyzeMain( node, k ) {

    isHeapVar = analyzeRefs( node, k );
    
    var seen = new Set(), work = new Set(), summaries = new Hash(),
	callersf = new Hash(), callersr = new Hash(), tcallers = new Hash(), finals = new Set();

    function propagate( s0, s1 ) {
	var ss = new Pair( s0, s1 );

	if( seen.add( ss ) ) {
	    work.add( ss );
	}
    }

    function set_add( x ) {
	return function( xs ) {
	    xs.add( x );
	    return xs;
	}
    }

    function callers_insert( s0ands1, s2 ) {
	callersf.update( s0ands1, set_add( s2 ), new Set() );
	callersr.update( s2, set_add( s0ands1 ), new Set() );
    }

    function update( s1, s2, s3, s4 ) {
	d = s4.evaluatedArgument();
	s2.environment
	s4.store
	
	console.log( s1.constructor.name );
	console.log( s2.constructor.name );
	console.log( s3.constructor.name );
	console.log( s4.constructor.name );
	throw 53;
    }
    
    var init = inject( node, k );

    work.add( new Pair( init, init ) );

    while( work.size() > 0 ) {
	var states = work.pop();

	console.log( "handling " + show( states.car ) + " to " + show( states.cdr ) );
	
	if( states.cdr instanceof CEvalExit ) {
	    if( states.car.isInitial ) {
		finals.add( states.cdr.evaluatedArgument() );
	    }
	    else {
		summaries.update( states.car, set_add( states.cdr ), new Set() );

		callersr.get( states.car, new Set() ).forEach( function( s0ands1 ) {
		    update( s0ands1.car, s0ands1.cdr, states.car, states.cdr );
		});

		tcallers.get( states.car, new Set() ).forEach( function( s0ands1 ) {
		    propagate( s0ands1.car, states.cdr );
		});
	    }
	}
	else if( states.cdr instanceof UEvalCall ) {
	    states.cdr.succs().forEach( function( state ) {
		propagate( state, state );

		callers_insert( states, state );

		summaries.get( state, new Set() ).forEach( function( state1 ) {
		    update( states.car, states.cdr, state, state1 );
		});
	    });
	}
	else if( states.cdr instanceof UEvalExit ) {
	    states.cdr.succs().forEach( function( state ) {
		propagate( state, state );
		
		tcallers.update( state, set_add( states ), new Set() );
		
		summaries.get( state, new Set() ).forEach( function( state ) {
		    propagate( states.car, state );
		});
	    });
	}
	else if( states.cdr instanceof UApplyEntry ) {
	    states.cdr.succs().forEach( function( state ) {
		propagate( states.car, state );
	    });
	}
	else {
	    console.log( states.car.constructor );
	    console.log( states.car );
	    console.log( states.cdr.constructor );
	    console.log( states.cdr );
	    throw new Error( "unhandled state" );
	}
    }

/*    console.log( "seen" );
    console.log( seen );
    console.log( "work" );
    console.log( work );
    console.log( "summaries" );
    console.log( summaries );
    console.log( "callersf" );
    console.log( callersf );
    console.log( "callersr" );
    console.log( callersr );
    console.log( "tcallers" );
    console.log( tcallers );*/
    
    return finals;
}




module.exports = {
analyze: analyzeMain
};
