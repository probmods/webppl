function finish( v ) {
    return function( nodes, i, succeed, fail ) {
	if( i === nodes.length ) {
	    return succeed( v, nodes, i );
	}
	else {
	    return fail();
	}
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
	return succeed( nodes[i], nodes, i + 1 );
    }
}

function result( v ) {
    return function( nodes, i, succeed, fail ) {
	return succeed( v, nodes, i );
    }
}

function bind( p, f ) {
    return function( nodes, i, succeed, fail ) {
	return p( nodes, i, function( v, nodes, i ) {
	    return f( v )( nodes, i, succeed, fail );
	}, fail );
    }
}

function star( p ) {
    function loop( nodes, i, succeed, fail ) {
	return bind( p, result )( nodes, i, function( v, nodes, i ) {
	    return loop( nodes, i, function( vs, nodes, i ) {
		return succeed( [v].concat(vs), nodes, i );
	    }, fail );
	}, function() {
	    return succeed( [], nodes, i );
	});
    }

    return loop;
}

function seq( ps ) {
    function loop( j ) {
	return function( nodes, i, succeed, fail ) {
	    if( i === ps.length ) {
		return succeed( [], nodes, i );
	    }
	    else {
		return bind( ps[j], result )( nodes, i, function( x, nodes, i ) {
		    return loop( j + 1 )( nodes, i, function( xs, nodes, i ) {
			return succeed( [x].concat(xs), nodes, i );
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
	    return succeed( x, nodes, i );
	});
    }
}

function apply( p, f ) {
    return function( nodes, i, succeed, fail ) {
	return p( nodes, i, function( x, nodes, i ) {
	    return succeed( f( x ), nodes, i );
	}, fail );
    }
}

function or( p, q ) {
    return function( nodes, i, succeed, fail ) {
	return p( nodes, i, succeed, function() {
	    return q( nodes, i, succeed, fail );
	});
    }
}

function single( p ) {
    return function( nodes, i, succeed, fail ) {
	return item( nodes, i, function( x, nodes, i ) {
	    return p( x, function( y ) {
		return succeed( y, nodes, i );
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
    star: star,
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
console.log( star( item )( [1,2,3], 0, id, fail ) );
console.log( single( singleton( 12 ) )( [12], 0, id, fail ) );
console.log( seq([])( [12], 0, id, fail ) );
console.log( seq([single(singleton( 12 ))])( [12], 0, id, fail ) );
console.log( seq( [single(singleton(12)),single(singleton(45))] )( [12,45], 0, id, fail ) );
console.log( seq( [single(singleton(12)),single(singleton(45))] )( [12,44], 0, id, fail ) );
*/
