"use strict";

var assert = require("assert");

var types = require("ast-types").namedTypes;
var build = require("ast-types").builders;

var List = require("immutable").List;
var Map = require("immutable").Map;
var Record = require("immutable").Record;
var Set = require("immutable").Set;

var Syntax = require("estraverse").Syntax;

var parse = require("./parser-combinator");
var analyzeRefs = require("./analyze-refs").analyzeRefs;

var fail = require("./util2").fail;
var clause = require("./util2").clause;

var isHeapVar = null;

var Primitive = new Record({
    type: "Primitive",
    name: null,
    apply: function( store, environment, args ) {
	throw new Error( "apply not implemented for " + this.name );
    }
});

var global = new Map({
    bernoulliERP: Set.of( new Primitive({
	name: "bernoulliERP",
	apply: (function( argument ) {
	    return function( store, environment, args ) {
		// change environment value based on args, such as only true for theta of 1
		return new CEvalExit({
		    store: store,
		    environment: environment.set( argument.name, Set.of( true, false ) ),
		    argument: argument
		});
	    }
	})({
	    type: "Identifier",
	    name: "bernoulliERP-argument",
	    heapRef: false
	})
    })),
    sample: Set.of( new Primitive({
	name: "sample",
	apply: function( store, environment, args ) {
	    console.log( "sample apply" );
	    console.log( args );
	    assert( args.get(0).size === 1 );
	    return args.get(0).first().apply( store, environment, args.get(1) );
	}
    }))
});

function Ai( operator, left, right ) {
    switch( operator ) {
    case "+":
	return Set.of( 12 );
    default:
	throw new Error( "Ai: unhandled operator " + operator );
    }
}

function Austar( store, environment, es ) {
    function loop( i ) {
	if( i == es.length ) {
	    return Set.of( new List() );
	}
	else {
	    var v = Au( store, environment, es[i] ), vs = loop( i + 1 );

	    return v.reduce( function( vss, v ) {
		return vs.reduce( function( vss, vs ) {
		    return vss.add( vs.unshift( v ) );
		}, vss );
	    }, new Set() );
	}
    }

    return loop( 0 );
}

function Au( store, environment, e ) {
    switch( e.type ) {
    case Syntax.ArrayExpression:
	return Austar( store, environment, e.elements );
    case Syntax.BinaryExpression:
	return Ai( e.operator, Au( store, environment, e.left ), Au( store, environment, e.right ) );
    case Syntax.Identifier:
	var v = null;

	if( e.heapRef ) {
	    v = store.get( e.name, null ) || global.get( e.name, null );
	}
	else {
	    v = environment.get( e.name, null );
	}

	if( v ) {
	    return v;
	}
	else {
	    console.log( e );
	    throw new Error( "not found in environment" );
	}
    case Syntax.Literal:
	return Set.of( e.value );
    default:
	console.log( e );
	throw new Error( "unimplemented Au" );
    }
}

function console_log( x ) {
    console.log( x );
}

function mapExtend( s, x, v ) {
    return s.update( x, new Set(), function( D ) {
	return D.add( v );
    });
}

function makeMapExtend( x, v ) {
    return function( s ) {
	return mapExtend( s, x, v );
    }
}

function mapJoin( s, x, D ) {
    return s.update( x, new Set(), function( D0 ) {
	return D0.union( D );
    });
}

function callSiteLabel( node ) {
    return node.arguments[1].arguments[0].value;
}

function makeCallb( destructor ) {
    return function( f ) {
	return function( node, succeed, fail ) {
	    return destructor( node, function() {
		return succeed( f.apply( this, arguments ) );
	    }, fail );
	}
    }
}

function foldsFuncDec( node, succeed, fail ) {
    if( types.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	types.FunctionExpression.check( node.declarations[0].init ) ) {
	return succeed( function( s ) {
	    return mapExtend( s, node.declarations[0].id.name, node.declarations[0].init );
	});
    }
    else return fail();
}

function destructContBin( node, succeed, fail ) {
    if( types.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	( node.declarations[0].id.name === "_return" ) ) {
	return succeed( node.declarations[0].init.name );
    }
    else return fail();
}

var callbContBin = makeCallb( destructContBin );

function foldsArguBin( node, succeed, fail ) {
    if( types.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) ) {
	return succeed( function( s ) {
	    return mapExtend( s, node.declarations[0].id.name, node.declarations[0].init );
	});
    }
    else return fail();
}

function destructNameDec( node, succeed, fail ) {
    if( types.VariableDeclaration.check( node ) &&
	( node.kind === "var" ) &&
	( node.declarations.length === 1 ) &&
	types.CallExpression.check( node.declarations[0].init ) &&
	types.MemberExpression.check( node.declarations[0].init.callee ) &&
	( node.declarations[0].init.callee.object.name === "address" ) &&
	( node.declarations[0].init.callee.property.name === "concat" ) ) {
	return succeed( node.declarations[0].init.arguments[0].value );
    }
    else return fail();
}

var callbNameDec = makeCallb( destructNameDec );

function destructFuncExp( node, succeed, fail ) {
    if( types.FunctionExpression.check( node ) ) {
	if( isContinuationFunc( node ) ) {
	    return succeed( contParams( node ), node.body );
	}
	else {
	    return succeed( funcParams( node ), node.body );
	}
    }
    else return fail();
}

function destructCondExp( node, succeed, fail ) {
    if( types.ExpressionStatement.check( node ) &&
	types.ConditionalExpression.check( node.expression ) ) {
	return succeed( node.expression.test, node.expression.consequent, node.expression.alternate );
    }
    else return fail();
}

var callbCondExp = makeCallb( destructCondExp );

function destructContCall( node, succeed, fail ) {
    if( types.ExpressionStatement.check( node ) &&
	types.CallExpression.check( node.expression ) &&
	isContinuationCall( node.expression ) ) {
	return succeed( node.expression.callee, node.expression.arguments[0] );
    }
    else return fail();
}

var callbContCall = makeCallb( destructContCall );

function destructUserCall( node, succeed, fail ) {
    if( types.ExpressionStatement.check( node ) &&
	types.CallExpression.check( node.expression ) &&
	( ! isContinuationCall( node.expression ) ) ) {
	return succeed( callSiteLabel( node.expression ),
			node.expression.callee,
			node.expression.arguments.slice(2),
			node.expression.arguments[0] );
    }
    else return fail();
}

var callbUserCall = makeCallb( destructUserCall );

// ---

function accessor( name ) {
    return function( x ) {
	return x[ name ];
    }
}

function contParams( node ) {
    return node.params.map( accessor( "name" ) );
}

function funcParams( node ) {
    return node.params.slice(2).map( accessor( "name" ) );
}

function isContinuationFunc( f ) {
    return f.params.length === 1;
}

function isContinuationCall( call ) {
    return call.arguments.length === 1;
}

// ---

function parseBEval( store, environment ) {
    return parse.bind( parse.single( parseCondExp( store, environment ) ), parse.finish );
}

function parseCondExp( store, environment ) {
    return callbCondExp( function( test, consequent, alternate ) {
	return makeBEval( store, environment, test, consequent, alternate );
    });
}

function makeBEval( store, environment, test, consequent, alternate ) {
    return new BEval({
	store: store,
	environment: environment,
	test: test,
	consequent: consequent,
	alternate: alternate
    });
}    

// ---

function parseCEval( store, environment ) {
    return parse.bind( parse.single( parseContCall( store, environment ) ), parse.finish );
}

function parseContCall( store, environment ) {
    return callbContCall( function( cont, argument ) {
	return makeCEval( store, environment, cont, argument );
    });
}

function makeCEval( store, environment, cont, argument ) {
    if( types.Identifier.check( cont ) ) {
	return new CEvalExit({
	    store: store,
	    environment: environment,
	    argument: argument
	});
    }
    else {
	return new CEvalInner({
	    store: store,
	    environment: environment,
	    cont: cont,
	    argument: argument
	});
    }
}

// ---

function parseUEval( store, environment ) {
    return parse.bind( parse.single( parseUserCall( store, environment ) ), parse.finish )
    /*
    return parse.bind( parse.maybe( parse.single( callbContBin( id ) ), false ), function() {
	return parse.bind( parse.rep( parse.single( parse.not( callbNameDec( id ) ) ) ), function( dummies ) {
	    return parse.bind( parse.single( callbNameDec( id ) ), function( label ) {
		return parse.bind( parse.apply( parse.rep( parse.single( foldsArguBin ) ), function( fs ) {
		    return fs.reduce( rapply, environment );
		}), function( environment ) {
		    return parse.bind( parse.single( parseUserCall( store, environment, label ) ), parse.finish )
		});
	    });
	});
    });*/
}
    
function parseUserCall( store, environment ) {
    return callbUserCall( function( label, callee, args, k ) {
	return makeUEval( store, environment, label, callee, args, k );
    });
}

function makeUEval( store, environment, label, callee, args, k ) {
    if( types.Identifier.check( k ) ) {
	return new UEvalExit({
	    store: store,
	    environment: environment,
	    label: label,
	    callee: callee,
	    args: args
	});
    }
    else {
	return new UEvalCall({
	    store: store,
	    environment: environment,
	    label: label,
	    callee: callee,
	    args: args,
	    k: k
	});
    }
}

// ---

var BEval = new Record({
    type: "BEval",
    store: null,
    environment: null,
    test: null,
    consequent: null,
    alternate: null,
    toString: show({
	store: show_environment,
	environment: show_environment,
	test: show_argument,
	consequent: show_argument,
	alternate: show_argument
    })
});

function parse_single_or( p, q ) {
    return function( node, succeed, fail ) {
	return p( node, succeed, function() {
	    return q( node, succeed, fail );
	});
    }
}

BEval.prototype.succs = function() {
    var parse = parse_single_or( parseContCall( this.store, this.environment ),
				 parseUserCall( this.store, this.environment ) );

    var vs = Au( this.store, this.environment, this.test );

    var states = new Set(), add = function( state ) {
	states = states.add( state );
    };

    if( vs.has( true ) ) {
	parse( build.expressionStatement( this.consequent ), add, fail( "not a call", this.consequent ) );
    }

    if( vs.has( false ) ) {
	parse( build.expressionStatement( this.alternate ), add, fail( "not a call", this.alternate ) );
    }
    
    return states;
}

var CEvalExit = new Record({
    type: "CEvalExit",
    store: null,
    environment: null,
    argument: null,
    toString: show({
	store: show_environment,
	environment: show_environment,
	argument: show_argument
    })
});

CEvalExit.prototype.succs = function() {
    return new Set();
}

CEvalExit.prototype.evaluatedArgument = function() {
    return Au( this.store, this.environment, this.argument );
}

function show_environment( environment ) {
    return "m";
    //return environment.toString();
}

function showFunc( f ) {
    if( isContinuationFunc( f ) ) {
	return "lambda " + contParams( f ).join(",") + ".<...>";
    }
    else {
	return "lambda " + f.params[0].name + " " + funcParams( f ).join(",") + ".<...>";
    }
}

function show_argument( argument ) {
    switch( argument.type ) {
    case Syntax.ArrayExpression:
	return "<[" + argument.elements.map( show_argument ).join(",") + "]>";
    case Syntax.BinaryExpression:
	return "<" + show_argument( argument.left ) + argument.operator + show_argument( argument.right ) + ">";
    case Syntax.CallExpression:
	return show_argument( argument.callee ) + "(" + argument.arguments.map( show_argument ).join(",") + ")"
    case Syntax.FunctionExpression:
	return "<" + showFunc( argument ) + ">";
    case Syntax.Identifier:
	return "<" + argument.name + ">";
    case Syntax.Literal:
	return "<" + argument.value + ">";
    case Syntax.MemberExpression:
	if( argument.computed ) {
	    return show_argument( argument.object ) + "[" + show_argument( arugment.property ) + "]";
	}
	else {
	    return show_argument( argument.object ) + "." + argument.property.name;
	}
    default:
	console.log( argument );
	throw new Error( "show_argument type " + argument.type );
    }
}

function show_value( x ) {
    if( typeof x === "number" || typeof x === "boolean" ) {
	return x.toString();
    }
    else if( x.type === "FunctionExpression" ) {
	return showFunc( x );
    }
    else {
	throw new Error( "show_value" );
    }
}

function show_values( D ) {
    return "{" + D.map( show_value ).toArray().join(",") + "}";
}

function map_show( show ) {
    return function( xs ) {
	return "[" + xs.map( show ).join(",") + "]";
    }
}

function show_raw_value( x ) {
    return x.toString();
}

function show( shows ) {
    return function() {
	var vs = [];

	for( var p in shows ) {
	    vs.push( shows[p]( this[p] ) );
	}
		   
	return this.type + "(" + vs.join(",") + ")";
    }
}

var CEvalInner = new Record({
    type: "CEvalInner",
    store: null,
    environment: null,
    cont: null,
    argument: null,
    toString: show({
	store: show_environment,
	environment: show_environment,
	cont: show_argument,
	argument: show_argument
    })
});

CEvalInner.prototype.succs = function() {
    var argument = Au( this.store, this.environment, this.argument );

    return Set.of( new CApply({
	store: this.store,
	environment: this.environment,
	cont: this.cont,
	argument: argument
    }) );
}

var CApply = new Record({
    type: "CApply",
    store: null,
    environment: null,
    cont: null,
    argument: null,
    toString: show({
	store: show_environment,
	environment: show_environment,
	cont: show_value,
	argument: show_values
    })
});

CApply.prototype.succs = function() {
    var store = this.store, environment = this.environment, argument = this.argument;

    return Set.of( destructFuncExp( this.cont, function( params, body ) {
	environment = mapJoin( environment, params[0], argument );
	    
	if( isHeapVar( params[0] ) ) {
	    store = mapJoin( store, params[0], argument );
	}

	return parseBody( store, environment, body.body );
    }, fail( "expected a function expression", this.cont ) ) );
}

var UEvalCall = new Record({
    type: "UEvalCall",
    store: null,
    environment: null,
    label: null,
    callee: null,
    args: null,
    k: null,
    toString: show({
	store: show_environment,
	environment: show_environment,
	label: show_raw_value,
	callee: show_argument,
	args: map_show( show_argument ),
	k: show_argument
    })
});

UEvalCall.prototype.succs = function() {
    var store = this.store, environment = this.environment;

    var args = List.of.apply( List, this.args ).map( function( x ) {
	return Au( store, environment, x );
    });

    return Au( store, environment, this.callee ).map( evalthis( store, environment, args ) );
}


var UEvalExit = new Record({
    type: "UEvalExit",
    store: null,
    environment: null,
    label: null,
    callee: null,
    args: null,
    toString: show({
	store: show_environment,
	environment: show_environment,
	label: show_raw_value,
	callee: show_argument,
	args: map_show( show_argument )
    })
});

function evalthis( store, environment, args ) {
    return function( f ) {
	switch( f.type ) {
	case "Primitive":
	    return f.apply( store, environment, args );
	default:
	    return new UApplyEntry({
		store: store,
		f: f,
		args: args
	    });
	}
    }
}
    
UEvalExit.prototype.succs = function() {
    var store = this.store, environment = this.environment;

    var args = List.of.apply( List, this.args ).map( function( x ) {
	return Au( store, environment, x );
    });

    return Au( this.store, this.environment, this.callee ).map( evalthis( store, environment, args ) );
}

var UApplyEntry = new Record({
    type: "UApplyEntry",
    store: null,
    f: null,
    args: null,
    toString: show({
	store: show_environment,
	f: show_value,
	args: map_show( show_values )
    })
});

UApplyEntry.prototype.succs = function() {
    var store = this.store, args = this.args;

    return Set.of( destructFuncExp( this.f, function( params, body ) {
	var environment = new Map();

	for( var i = 0; i < params.length; ++i ) {
	    environment = mapJoin( environment, params[i], args.get(i) );
		
	    if( isHeapVar( params[i] ) ) {
		store = mapJoin( store, params[i], args.get(i) );
	    }
	}

	return parseBody( store, environment, body.body );
    }, fail( "expected a function expression here", this.f ) ) );
}

function rapply( x, f ) {
    return f( x );
}

function id( x ) {
    return x;
}

function parseDeclaration( node, succeed, fail ) {
	if( types.VariableDeclaration.check( node ) &&
	    node.declarations.length === 1 ) {
	    return succeed( node.declarations[0] );
	}
	else return fail();
    }

function parseBody( store, environment, nodes ) {
    //console.log( nodes );
    return parse.bind( parse.apply( parse.rep( parse.single( parseDeclaration ) ), function( declarations ) {
	declarations.forEach( function( declaration ) {
	    environment = mapExtend( environment, declaration.id.name, declaration.init );

	    if( isHeapVar( declaration.id.name ) ) {
		store = mapExtend( store, declaration.id.name, declaration.init );
	    }
	});
    }), function( ignore ) {
	return parse.or([ parseBEval( store, environment ),
			  parseCEval( store, environment ),
			  parseUEval( store, environment ) ]);
    })( nodes, 0, id, fail( "parseBody: failed", nodes ) );
}

function inject( node ) {
    assert( types.Program.check( node ) );
    assert( node.body.length === 1 );
    assert( types.ExpressionStatement.check( node.body[0] ) );

    return new UApplyEntry({
	store: new Map(),
	f: node.body[0].expression,
	args: new List()
    });
}
/*
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
}*/

function state_equal( s0, s1 ) {
    var all = s0.reduce( function( x, v, k ) {
	if( x ) {
	    if( v.equals ) {
		if( v.equals( s1[k] ) ) {
		    console.log( v + " equ " + s1[k] );
		    return true;
		}
		else {
		    console.log( v + " NEQ " + s1[k] );
		    return false;
		}
	    }
	    else {
		if( v === s1[k] ) {
		    console.log( v + " === " + s1[k] );
		    return true;
		}
		else {
		    console.log( k + ": " + v + " !== " + s1[k] );
		    return false;
		}
	    }
	}
    }, true );

    if( all ) {
	console.log( "all aspects are equal, states are equal: " + s0.equals( s1 ) );
    }

    return all;
}

// expects an AST of a named, CPS'd program
function analyzeMain( node ) {
    console.log( require("escodegen").generate( node ) );
    
    Map.prototype.toString = function() {
	var rep = "{ ";
	
	var i = this.entries();

	var v = i.next();

	while( ! v.done ) {
	    rep = rep + v.value[0] + "=>" + v.value[1];
	    v = i.next();
	}

	rep = rep + "}";

	return rep;
    }
    
    var Pair = new Record({
	car: null,
	cdr: null,
	toString: function() {
	    return "(" + this.car + "," + this.cdr + ")";
	}
    });

    isHeapVar = analyzeRefs( node );
    
    var seen = new Set(), work = new Set(), summaries = new Map(),
	callers = new Map(), tcallers = new Map(), finals = new Set();

    function propagate( s0, s1 ) {
	var ss = new Pair({
	    car: s0,
	    cdr: s1
	});

	if( ! seen.has( ss ) ) {
	    /*seen.forEach( function( ss0 ) {
		state_equal( ss.car, ss0.car ) && state_equal( ss.cdr, ss0.cdr );
	    });*/
	    
	    seen = seen.add( ss );
	    work = work.add( ss );
	}
    }

    function update( s1, s2, s3, s4 ) {
	assert( s1.type === "UApplyEntry" );
	assert( s2.type === "UEvalCall" );
	assert( s3.type === "UApplyEntry" );
	assert( s4.type === "CEvalExit" );

	var environment = s2.environment;

	if( types.Identifier.check( s2.callee ) && ( ! s2.callee.heapRef ) ) {
	    environment = mapExtend( environment, s2.callee.name, s3.f );
	}
	
	propagate( s1, new CApply({
	    store: s4.store,
	    environment: environment,
	    cont: s2.k,
	    argument: s4.evaluatedArgument()
	}));
    }
    
    var init = inject( node );

    propagate( init, init );

    while( work.size > 0 ) {
	var states = work.first();

	console.log( "CAR " + states.car );
	console.log( "CDR " + states.cdr );
	
	work = work.rest();

	if( states.cdr instanceof CEvalExit ) {
	    if( states.car.equals( init ) ) {
		finals = finals.union( states.cdr.evaluatedArgument() );
		console.log( "NEW FINALS" );
		console.log( finals );
	    }
	    else {
		summaries = mapExtend( summaries, states.car, states.cdr );

		callers.get( states.car, new Set() ).forEach( function( s0ands1 ) {
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

		callers = mapExtend( callers, state, states );
		
		summaries.get( state, new Set() ).forEach( function( state1 ) {
		    update( states.car, states.cdr, state, state1 );
		});
	    });
	}
	else if( states.cdr instanceof UEvalExit ) {
	    states.cdr.succs().forEach( function( state ) {
		propagate( state, state );

		tcallers = mapExtend( tcallers, state, states );
		
		summaries.get( state, new Set() ).forEach( function( state ) {
		    propagate( states.car, state );
		});
	    });
	}
	else if( states.cdr instanceof UApplyEntry ||
		 states.cdr instanceof CApply ||
		 states.cdr instanceof CEvalInner ||
		 states.cdr instanceof BEval ) {
	    states.cdr.succs().forEach( function( state ) {
		propagate( states.car, state );
	    });
	}
	else {
	    throw new Error( "unhandled state with type " + states.cdr.type );
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
