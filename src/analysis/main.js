"use strict";

var assert = require('assert');

var types = require('ast-types').namedTypes;
var build = require('ast-types').builders;

var List = require('immutable').List;
var Map = require('immutable').Map;
var Record = require('immutable').Record;
var Set = require('immutable').Set;
var Stack = require('immutable').Stack;

var Syntax = require('estraverse').Syntax;

var match = require('./match').match;
var clause = require('./match').clause;
var fail = require('../syntax').fail;
var destruct = require('./match-lang');

var parse = require('./parser-combinator');
var analyzeRefs = require('./analyze-refs').analyzeRefs;
var isHeapRef = require('./analyze-refs').isHeapRef;


var isHeapVar = null;

var Pair = new Record({
    car: null,
    cdr: null
});

var Num = new Record({
    type: "Num"
});

var primitives = {
    bernoulliERP: function( p ) {
	return Set.of( true, false );
    }
}

function Set_add( v ) {
    return function( vs ) {
	return vs.add( v );
    }
}

function Set_union( vs ) {
    return function( ws ) {
	return ws.union( vs );
    }
}

function storeExtend( store, x, v ) {
    if( isHeapVar( x ) ) {
	return store.update( x, new Set(), Set_union( v ) );
    }
    else return store;
}

function environmentExtend( environment, x, v ) {
    return environment.update( x, new Set(), Set_union( v ) );
}

function Au( store, environment, expr ) {
    switch( expr.type ) {
    case Syntax.BinaryExpression:
	if( expr.operator === "+" ) {
	    return Set.of( new Num({}) );
	}
	else {
	    console.log( Au( store, environment, expr.left ) );
	    console.log( Au( store, environment, expr.right ) );
	    throw new Error( "Au: unhandled binary operator " + expr.operator );
	}
    case Syntax.FunctionExpression:
	return Set.of( expr );
    case Syntax.Identifier:
	var value = environment.get( expr.name, false ) || store.get( expr.name, false );

	if( ! value ) {
	    if( primitives.hasOwnProperty( expr.name ) ) {
		value = Set.of( primitives[ expr.name ] );
	    }
	    else throw new Error( "Au: unbound variable: " + expr.name );
	}

	return value;
    case Syntax.Literal:
	return Set.of( expr.value );
    default:
	console.log( expr );
	throw new Error( "Au: unimplemented type" );
    }
}

var Entr = new Record({
    type: "Entr",
    store: null,
    fun: null,
    args: null,
});

function parseDeclaration(node, succeed, fail) {
  if (types.VariableDeclaration.check(node) &&
      node.declarations.length === 1) {
    return succeed({
      id: node.declarations[0].id.name,
      init: node.declarations[0].init
    });
  }
  else return fail();
}

Entr.prototype.succs = function() {
    var store = this.store, args = this.args;

    if( this.fun instanceof Function ) {
	return Set.of( new Exit({
	    store: store,
	    value: this.fun.apply( this.fun, args.toArray() )
	}));
    }
    else {
	return destruct.funcExp( this.fun, function( params, body ) {
	    var environment = new Map(), n = params.length;

	    for( var i = 0; i < n; ++i ) {
		environment = environmentExtend( environment, params[i], args.get(i) );
		store = storeExtend( store, params[i], args.get(i) );
	    }
    
	    return parse.bind( parse.apply( parse.seq([ parse.rep( parse.single(parseDeclaration) ), parse.item ]), function( declarations_stmt ) {
		declarations_stmt[0].forEach(function(declaration) {
		    var v = Au( store, environment, declaration.init );

		    environment = environmentExtend( environment, declaration.id, v );
		    store = storeExtend( store, declaration.id, v );
		});

		if( types.ExpressionStatement.check( declarations_stmt[1] ) ) {
		    return declarations_stmt[1].expression;
		}
		else {
		    return fail( "not an expression statement", declarations_stmt[1] )();
		}
	    }), parse.finish )( body.body, 0, function( expr ) {
		return aeval( store, environment, expr );
	    }, fail( "failed to parse body", body.body ) );
	}, fail( "not a function expression", this.fun ) );
    }
}


var Call = new Record({
    type: "Call",
    store: null,
    environment: null,
    f: null,
    es: null,
    kont: null,
    label: null
});

Call.prototype.succs = function() {
    var store = this.store, environment = this.environment;

    var args = new List( this.es ).map( function( e ) {
	return Au( store, environment, e );
    });
    
    return Au( store, environment, this.f ).map( function( fun ) {
	return new Entr({
	    store: store,
	    fun: fun,
	    args: args
	});
    });
}

var Exit = new Record({
    type: "Exit",
    store: null,
    value: null
});


function aeval( store, environment, expr ) {
    return match( expr, [
	clause( destruct.sampExp, function( label, erp, params, kont ) {
	    return Set.of( new Call({
		store: store,
		environment: environment,
		f: erp,
		es: params,
		kont: kont,
		label: label
	    }));
	}),
	clause( destruct.userCall, function( label, f, es, kont ) {
	    return Set.of( new Call({
		store: store,
		environment: environment,
		f: f,
		es: es,
		kont: kont,
		label: label
	    }));
	}),
	clause( destruct.contCall, function( kont, e ) {
	    var value = Au( store, environment, e );
	    
	    if( types.Identifier.check( kont ) ) {
		return Set.of( new Exit({
		    store: store,
		    value: value
		}));
	    }
	    else {
		return destruct.contExp( kont, function( param, expr ) {
		    environment = environmentExtend( environment, param, v );
		    store = storeExtend( store, param, v );

		    return aeval( store, environment, expr );
		}, fail( "not a continuation lambda", kont ) );
	    }
	}),
	clause( destruct.condExp, function( test, consequent, alternate ) {
	    var succs = new Set(), test = Au( store, environment, test );
	    
	    if( test.has( true ) ) {
		succs = succs.union( aeval( store, environment, consequent ) );
	    }
	    
	    if( test.has( false ) ) {
		succs = succs.union( aeval( store, environment, alternate ) );
	    }

	    return succs;
	})], fail( "no match for expression", expr ) );
}

function inject(node) {
  assert(types.Program.check(node));
  assert(node.body.length === 1);
  assert(types.ExpressionStatement.check(node.body[0]));

  return new Entr({
    store: new Map(),
    fun: node.body[0].expression,
    args: new List()
  });
}

function analyzeMain( program ) {
    isHeapVar = analyzeRefs( program );
    
    var seen = new Set(), work = new Stack(), calls = new Map(), summaries = new Map(), finals = new Set();

    function propagate( state0, state1 ) {
	work = work.unshift( new Pair({
	    car: state0,
	    cdr: state1
	}));
    }
    
    function update( state0, state1, state2, state3 ) {
	if( types.Identifier.check( state1.kont ) ) {
	    summaries = summaries.update( state0, new Set(), Set_add( state3 ) );
	    propagate( state0, state3 );
	}
	else {
	    var store = state3.store, environment = state1.environment;

	    if( types.Identifier.check( state1.callee ) && isHeapVar( state1.callee.name ) ) {
		environment = environment.set( state1.callee.name, Set.of( state2.fun ) );
	    }

	    destruct.contExp( state1.kont, function( param, expr ) {
		environment = environmentExtend( environment, param, state3.value );
		store = storeExtend( store, param, state3.value );
		    
		aeval( store, environment, expr ).forEach( function( state4 ) {
		    propagate( state0, state4 );
		});
	    }, fail( "continuation not a function expression", state1.kont ) );
	}
    }
    
    function call( states01, state2 ) {
	calls = calls.update( state2, new Set(), Set_add( states01 ) );

	var exits = summaries.get( state2, new Set() );

	if( exits.size > 0 ) {
	    var state0 = states01.car, state1 = states01.cdr;
	
	    exits.forEach( function( state3 ) {
		update( state0, state1, state2, state3 );
	    });
	}
	else {
	    propagate( state2, state2 );
	}
    }

    function retr( state2, state3 ) {
	calls.get( state2, new Set() ).forEach( function( states01 ) {
	    var state0 = states01.car, state1 = states01.cdr;

	    update( state0, state1, state2, state3 );
	});
    }

    var init = inject( program );
    
    work = work.unshift( new Pair({ car: init, cdr: init }) );

    while( work.size > 0 ) {
	var states01 = work.first();
	work = work.shift();

	if( ! seen.has( states01 ) ) {
	    seen = seen.add( states01 );
	    
	    var state0 = states01.car, state1 = states01.cdr;
	    
	    if( state1 instanceof Entr ) {
		state1.succs().forEach( function( state2 ) {
		    propagate( state0, state2 );
		});
	    }
	    else if( state1 instanceof Call ) {
		state1.succs().forEach( function( state2 ) {
		    call( states01, state2 );
		});
	    }
	    else if( state1 instanceof Exit ) {
		if( state0.equals( init ) ) {
		    finals = finals.add( state1 );
		}
		else {
		    retr( state0, state1 );
		}
	    }
	    else throw new Error( "analyze: unhandled state " + state1 );
	}
    }

    return {
	calls: calls,
	summaries: summaries,
	finals: finals
    }
}

module.exports = {
  analyze: analyzeMain
};
