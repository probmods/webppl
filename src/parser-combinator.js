function finish() {
    var vs = arguments;
    
    return function( nodes, i, succeed, fail ) {
	if( i === nodes.length ) {
	    return succeed.apply( this, vs );
	}
	else return fail();
    }
}

function zero( nodes, i, succeed, fail ) {
    return fail();
}

function item( nodes, i, succeed, fail ) {
    if( i === nodes.length ) {
	return fail();
    }
    else {
	return succeed( nodes, i + 1, nodes[i] );
    }
}

function result() {
    var vs = arguments;
    
    return function( nodes, i, succeed, fail ) {
	return succeed.apply( this, Array.prototype.concat.apply( [ nodes, i ], vs ) );
    }
}

function bind( p, f ) {
    return function( nodes, i, succeed, fail ) {
	return p( nodes, i, function( nodes, i ) {
	    return f.apply( this, Array.prototype.slice.call( arguments, 2 ) )( nodes, i, succeed, fail );
	}, fail );
    }
}

function rep( p ) {
    function loop( nodes, i, succeed, fail ) {
	return bind( p, result )( nodes, i, function( nodes, i, v ) {
	    return loop( nodes, i, function( nodes, i, vs ) {
		return succeed( nodes, i, [v].concat(vs) );
	    }, fail );
	}, function() {
	    return succeed( nodes, i, [] );
	});
    }

    return loop;
}

function seq( ps ) {
    function loop( j ) {
	return function( nodes, i, succeed, fail ) {
	    if( j === ps.length ) {
		return succeed( nodes, i, [] );
	    }
	    else {
		return bind( ps[j], result )( nodes, i, function( nodes, i, x ) {
		    return loop( j + 1 )( nodes, i, function( nodes, i, xs ) {
			return succeed( nodes, i, [x].concat(xs) );
		    }, fail );
		}, fail );
	    }
	}
    }

    return loop( 0 );
}
		    
function maybe( p, x ) {
    return function( nodes, i, succeed, fail ) {
	return p( nodes, i, succeed, function() {
	    return succeed( nodes, i, x );
	});
    }
}

function apply( p, f ) {
    return function( nodes, i, succeed, fail ) {
	return p( nodes, i, function( nodes, i ) {
	    return succeed( nodes, i, f.apply( this, Array.prototype.slice.call( arguments, 2 ) ) );
	}, fail );
    }
}

function or( ps ) {
    function loop( j ) {
	if( j === ps.length ) {
	    return function( nodes, i, succeed, fail ) {
		return fail();
	    }
	}
	else {
	    return function( nodes, i, succeed, fail ) {
		return ps[j]( nodes, i, succeed, function() {
		    return loop( j + 1 )( nodes, i, succeed, fail );
		});
	    }
	}
    }

    return loop( 0 );
}
function single( p ) {
    return function( nodes, i, succeed, fail ) {
	return item( nodes, i, function( nodes, i, node ) {
	    return p( node, function( v ) {
		return succeed.apply( this, Array.prototype.concat.apply( [ nodes, i ], arguments ) );
	    }, fail );
	}, fail );
    }
}

function not( p ) {
    return function( node, success, fail ) {
	return p( node, function( dummy ) {
	    return fail();
	}, function() {
	    return success( 42 );
	});
    }
}

module.exports = {
    finish: finish,
    zero: zero,
    item: item,
    result: result,
    bind: bind,
    rep: rep,
    seq: seq,
    maybe: maybe,
    apply: apply,
    or: or,
    single: single,
    not: not
}

/*
function singleton( x ) {
    return function( y, succeed, fail ) {
	if( x === y ) {
	    return succeed( y );
	}
	else {
	    return fail();
	}
    }
}

function id( v, nodes, i ) {
    return v;
}

function fail() {
    return 42;
}

console.log( bind( item, result )( [1,2,3], 0, id, fail ) );
console.log( rep( item )( [1,2,3], 0, id, fail ) );
console.log( single( singleton( 12 ) )( [12], 0, id, fail ) );
console.log( seq([])( [12], 0, id, fail ) );
console.log( seq([single(singleton( 12 ))])( [12], 0, id, fail ) );
console.log( seq( [single(singleton(12)),single(singleton(45))] )( [12,45], 0, id, fail ) );
console.log( seq( [single(singleton(12)),single(singleton(45))] )( [12,44], 0, id, fail ) );
*/
