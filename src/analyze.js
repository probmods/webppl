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

var isHeapVar = null;

var Primitive = new Record({
    type: "Primitive",
    name: null,
    apply: function( store, environment, args ) {
	throw new Error( "apply not implemented for " + this.name );
    },
    sample: function( theta ) {
	throw new Error( "sample not implemented for " + this.name );
    }
});

var AValue = new Record({
    values: new Set(),
    states: new Set()
});

function makeGlobal( primitive ) {
    return new AValue({
	values: Set.of( primitive ),
	states: new Set()
    });
}

var global = new Map({
    bernoulliERP: makeGlobal( new Primitive({
	name: "bernoulliERP",
	apply: function( tss ) {
	    return tss.reduce( function( D, ts ) {
		if( ts.get(0) === 1 ) {
		    return D.add( true );
		}
		else if( ts.get(0) === 0 ) {
		    return D.add( false );
		}
		else return Set.of( true, false );
	    }, new Set() );
	}
    }) ),
    sample: makeGlobal( new Primitive({
	name: "sample",
	apply: (function( argument ) {
	    return function( state, store, environment, dependence, args ) {
		var sampler = args.get(0), parameters = args.get(1);

		return sampler.values.map( function( erp ) {
		    var sample = new AValue({
			values: sampler.values.reduce( function( vs, erp ) {
			    return vs.union( erp.apply( parameters.values ) );
			}, new Set() ),
			states: dependence.union( sampler.states ).union( parameters.states ).add( state )
		    });
		    
		    return new CEvalExit({
			store: store,
			environment: envJoin( environment, argument.name, sample ),
			dependence: dependence,
			argument: argument
		    });
		});
	    }
	})({
	    type: "Identifier",
	    name: "sample-identifier",
	    heapRef: false
	})
    }))
});

function Ai( operator, left, right ) {
    switch( operator ) {
    case "+":
	// XXX abstract values
	return new AValue({
	    values: Set.of( 12 ),
	    states: left.states.union( right.states )
	});
    default:
	throw new Error( "Ai: unhandled operator " + operator );
    }
}

function Austar( store, environment, dependence, es ) {
    function loop( i ) {
	if( i == es.length ) {
	    return new AValue({
		values: Set.of( new List() ),
		states: new Set()
	    });
	}
	else {
	    var v = Au( store, environment, dependence, es[i] ), vs = loop( i + 1 );

	    return new AValue({
		values: v.values.reduce( function( vss, v ) {
		    return vs.values.reduce( function( vss, vs ) {
			return vss.add( vs.unshift( v ) );
		    }, vss );
		}, new Set() ),
		states: vs.states.union( v.states )
	    });
	}
    }

    return loop( 0 );
}

function Au( store, environment, dependence, e ) {
    switch( e.type ) {
    case Syntax.ArrayExpression:
	return Austar( store, environment, dependence, e.elements );
    case Syntax.BinaryExpression:
	return Ai( e.operator, Au( store, environment, dependence, e.left ), Au( store, environment, dependence, e.right ) );
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
	return new AValue({
	    values: Set.of( e.value ),
	    states: dependence
	});
    default:
	console.log( e );
	throw new Error( "unimplemented Au" );
    }
}

function envExtend( s, x, v, ss ) {
    return s.update( x, new AValue({}), function( D ) {
	return new AValue({
	    values: D.values.add( v ),
	    states: D.states.union( ss )
	});
    })
}

function envJoin( s, x, D ) {
    return s.update( x, new AValue({}), function( D0 ) {
	return new AValue({
	    values: D0.values.union( D.values ),
	    states: D0.states.union( D.states )
	});
    });
}

function mapExtend( s, x, v ) {
    return s.update( x, new Set(), function( D ) {
	return D.add( v );
    });
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

function parseBEval( store, environment, dependence ) {
    return parse.bind( parse.single( parseCondExp( store, environment, dependence ) ), parse.finish );
}

function parseCondExp( store, environment, dependence ) {
    return callbCondExp( function( test, consequent, alternate ) {
	return makeBEval( store, environment, dependence, test, consequent, alternate );
    });
}

function makeBEval( store, environment, dependence, test, consequent, alternate ) {
    return new BEval({
	store: store,
	environment: environment,
	dependence: dependence,
	test: test,
	consequent: consequent,
	alternate: alternate
    });
}    

// ---

function parseCEval( store, environment, dependence ) {
    return parse.bind( parse.single( parseContCall( store, environment, dependence ) ), parse.finish );
}

function parseContCall( store, environment, dependence ) {
    return callbContCall( function( cont, argument ) {
	return makeCEval( store, environment, dependence, cont, argument );
    });
}

function makeCEval( store, environment, dependence, cont, argument ) {
    if( types.Identifier.check( cont ) ) {
	return new CEvalExit({
	    store: store,
	    environment: environment,
	    dependence: dependence,
	    argument: argument
	});
    }
    else {
	return new CEvalInner({
	    store: store,
	    environment: environment,
	    dependence: dependence,
	    cont: cont,
	    argument: argument
	});
    }
}

// ---

function parseUEval( store, environment, dependence ) {
    return parse.bind( parse.single( parseUserCall( store, environment, dependence ) ), parse.finish )
}
    
function parseUserCall( store, environment, dependence ) {
    return callbUserCall( function( label, callee, args, k ) {
	return makeUEval( store, environment, dependence, label, callee, args, k );
    });
}

function makeUEval( store, environment, dependence, label, callee, args, k ) {
    if( types.Identifier.check( k ) ) {
	return new UEvalExit({
	    store: store,
	    environment: environment,
	    dependence: dependence,
	    label: label,
	    callee: callee,
	    args: args
	});
    }
    else {
	return new UEvalCall({
	    store: store,
	    environment: environment,
	    dependence: dependence,
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
    dependence: null,
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

function check_equal( v0, v1 ) {
    v0.reduce( function( acc, value, key ) {
	if( acc ) {
	    if( value.equals ) {
		if( value.equals( v1[ key ] ) ) {
		    console.log( key + " equ " + key );
		    return true;
		}
		else {
		    console.log( key + " neq " + key );
		    console.log( value );
		    console.log( v1[ key ] );
		    return false;
		}
	    }
	    else {
		if( value === v1[ key ] ) {
		    console.log( key + " === " + key );
		    return true;
		}
		else {
		    console.log( key + " !== " + key );
		    console.log( value );
		    console.log( v1[ key ] );
		    return false;
		}
	    }
	}
	else return false;
    }, true );
}

BEval.prototype.succs = function() {
    var vs = Au( this.store, this.environment, this.dependence, this.test );

    var states = new Set(), add = function( state ) {
	states = states.add( state );
    };

    if( vs.states.size > 1 ) {
	console.log( "checking equality" );
	check_equal( vs.states.first(), vs.states.rest().first() );
    }

    var parse = parse_single_or( parseContCall( this.store, this.environment, this.dependence.union( vs.states ) ),
				 parseUserCall( this.store, this.environment, this.dependence.union( vs.states ) ) );

    if( vs.values.has( true ) ) {
	parse( build.expressionStatement( this.consequent ), add, fail( "not a call", this.consequent ) );
    }

    if( vs.values.has( false ) ) {
	parse( build.expressionStatement( this.alternate ), add, fail( "not a call", this.alternate ) );
    }
    
    return states;
}

var CEvalExit = new Record({
    type: "CEvalExit",
    store: null,
    environment: null,
    dependence: null,
    argument: null,
    toString: show({
	store: show_store,
	environment: show_environment,
	argument: show_argument
    })
});

CEvalExit.prototype.succs = function() {
    return new Set();
}

CEvalExit.prototype.evaluatedArgument = function() {
    return Au( this.store, this.environment, this.dependence, this.argument );
}


var CEvalInner = new Record({
    type: "CEvalInner",
    store: null,
    environment: null,
    dependence: null,
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
    var argument = Au( this.store, this.environment, this.dependence, this.argument );

    return Set.of( new CApply({
	store: this.store,
	environment: this.environment,
	dependence: this.dependence,
	cont: this.cont,
	argument: argument
    }) );
}

var CApply = new Record({
    type: "CApply",
    store: null,
    environment: null,
    dependence: null,
    cont: null,
    argument: null,
    toString: show({
	store: show_store,
	environment: show_environment,
	cont: show_operator,
	argument: show_avalue
    })
});

CApply.prototype.succs = function() {
    var store = this.store, environment = this.environment,
	dependence = this.dependence, argument = this.argument;

    return Set.of( destructFuncExp( this.cont, function( params, body ) {
	environment = envJoin( environment, params[0], argument );
	    
	if( isHeapVar( params[0] ) ) {
	    store = envJoin( store, params[0], argument );
	}

	return parseBody( store, environment, dependence, body.body );
    }, fail( "expected a function expression", this.cont ) ) );
}

function UEval_succs() {
    var store = this.store, environment = this.environment, dependence = this.dependence;
    
    var Df = Au( store, environment, dependence, this.callee );

    var Dargs = List.of.apply( List, this.args ).map( function( x ) {
	return Au( store, environment, dependence, x );
    });

    var self = this;

    dependence = dependence.union( Df.states );
    
    return Df.values.reduce( function( ss, f ) {
	switch( f.type ) {
	case "Primitive":
	    return ss.union( f.apply( self, store, environment, dependence, Dargs ) );
	default:
	    return ss.add( new UApplyEntry({
		store: store,
		dependence: dependence,
		f: f,
		args: Dargs
	    }));
	}
    }, new Set() );
}

var UEvalCall = new Record({
    type: "UEvalCall",
    store: null,
    environment: null,
    dependence: null,
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

UEvalCall.prototype.succs = UEval_succs;

var UEvalExit = new Record({
    type: "UEvalExit",
    store: null,
    environment: null,
    dependence: null,
    label: null,
    callee: null,
    args: null,
    toString: show({
	store: show_store,
	environment: show_environment,
	label: show_raw_value,
	callee: show_argument,
	args: map_show( show_argument )
    })
});

UEvalExit.prototype.succs = UEval_succs;

var UApplyEntry = new Record({
    type: "UApplyEntry",
    store: null,
    dependence: null,
    f: null,
    args: null,
    toString: show({
	store: show_store,
	f: show_operator,
	args: map_show( show_avalue )
    })
});

UApplyEntry.prototype.succs = function() {
    var store = this.store, dependence = this.dependence, args = this.args;

    return Set.of( destructFuncExp( this.f, function( params, body ) {
	var environment = new Map();

	for( var i = 0; i < params.length; ++i ) {
	    environment = envJoin( environment, params[i], args.get(i) );
		
	    if( isHeapVar( params[i] ) ) {
		store = envJoin( store, params[i], args.get(i) );
	    }
	}

	return parseBody( store, environment, dependence, body.body );
    }, fail( "expected a function expression", this.f ) ) );
}

function enter( store, environment, dependence, f, args ) {
}

// SHOW

function show_store( store ) {
    return "<sto>";
}

function show_environment( environment ) {
    return "<env>";
}

function show_operator( f ) {
    if( f.type === "FunctionExpression" ) {
	return showFunc( f );
    }
    else {
	console.log( f );
	throw new Error( "show_operator: unhandled type" );
    }
}

function show_avalue( D ) {
    return D.toString();
}

function showFunc( f ) {
    if( isContinuationFunc( f ) ) {
	return "fun " + contParams( f ).join(",") + ".<...>";
    }
    else {
	return "fun " + f.params[0].name + " " + funcParams( f ).join(",") + ".<...>";
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

function parseBody( store, environment, dependence, nodes ) {
    return parse.bind( parse.apply( parse.rep( parse.single( parseDeclaration ) ), function( declarations ) {
	declarations.forEach( function( declaration ) {
	    environment = envExtend( environment, declaration.id.name, declaration.init, dependence );

	    if( isHeapVar( declaration.id.name ) ) {
		store = envExtend( store, declaration.id.name, declaration.init, dependence );
	    }
	});
    }), function( ignore ) {
	return parse.or([ parseBEval( store, environment, dependence ),
			  parseCEval( store, environment, dependence ),
			  parseUEval( store, environment, dependence ) ]);
    })( nodes, 0, id, fail( "parseBody: failed", nodes ) );
}

function inject( node ) {
    assert( types.Program.check( node ) );
    assert( node.body.length === 1 );
    assert( types.ExpressionStatement.check( node.body[0] ) );

    return new UApplyEntry({
	store: new Map(),
	dependence: new Set(),
	f: node.body[0].expression,
	args: new List()
    });
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

    var pred = new Map();

    function successor( s0, s1 ) {
	if( pred.has( s1 ) ) {
	    throw new Error( "successor: has the successor already!" );
	}
	else {
	    pred = pred.set( s1, s0 );
	}
    }
    
    function propagate( s0, s1 ) {
	var ss = new Pair({
	    car: s0,
	    cdr: s1
	});

	if( ! seen.has( ss ) ) {
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
	    environment = envExtend( environment, s2.callee.name, s3.f, Au( s2.store, s2.environment, s2.dependence, s2.callee ).states );
	}
	
	propagate( s1, new CApply({
	    store: s4.store,
	    environment: environment,
	    dependence: s2.dependence, // XXX check this
	    cont: s2.k,
	    argument: s4.evaluatedArgument()
	}));
    }
    
    var init = inject( node );

    propagate( init, init );
    successor( init, init );

    while( work.size > 0 ) {
	var states = work.first();

	console.log( "CAR " + states.car );
	console.log( "CDR " + states.cdr );
	
	work = work.rest();

	if( states.cdr instanceof CEvalExit ) {
	    if( states.car.equals( init ) ) {
		finals = finals.add( states.cdr.evaluatedArgument() );
		console.log( "NEW FINALS!!!" );
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
		successor( state, state );

		callers = mapExtend( callers, state, states );
		
		summaries.get( state, new Set() ).forEach( function( state1 ) {
		    update( states.car, states.cdr, state, state1 );
		});
	    });
	}
	else if( states.cdr instanceof UEvalExit ) {
	    states.cdr.succs().forEach( function( state ) {
		propagate( state, state );
		successor( state, state );

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
		successor( states.car, state );
	    });
	}
	else {
	    throw new Error( "unhandled state with type " + states.cdr.type );
	}
    }

    function trace( state ) {
	var trace = new List();

	if( state instanceof UEvalExit ) {
	    trace = trace.unshift( state.label );

	    state = pred.get( state );

	    if( state instanceof UApplyEntry ) {
		trace = trace.unshift( tcallers.get( state ).first().cdr.label );
	    }
	}

	return trace;
    }

    finals.forEach( function( D ) {
	console.log( D.states.map( trace ) );
    });

    console.log( finals );
    
    return finals;
}

module.exports = {
analyze: analyzeMain
};
