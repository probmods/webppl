"use strict";

function id( ss01 ) {
    return "s" + Math.abs( ss01.hashCode() ).toString(16);
}

function desc( s ) {
    switch( s.type ) {
    case "Entr":
	return s.fun.params.toString();
    case "Exit":
	return s.value.toString();
    default:
	return s.type;
    }
}

function node( ss01 ) {
    return "  " + id( ss01 ) + " [label=\"" + desc( ss01.cdr ) + "\"]\n"
}

function internal_edge( ss01, ss02 ) {
    return "  " + id( ss01 ) + " -> " + id( ss02 ) + "\n";
}

function call_retr_edge( ss01, ss23 ) {
    return "  " + id( ss01 ) + " -> " + id( ss23 ) + " [style=dotted]\n";
}

function vizualize( analysis, os ) {
    os.write( "digraph cfg {\n" );

    analysis.seen.forEach( function( ss01 ) {
	os.write( node( ss01 ) );
    });

    analysis.preds.forEach( function( ss01, ss02 ) {
	os.write( internal_edge( ss01, ss02 ) );
    });
    
    analysis.calls.forEach( function( ss01s, ss22 ) {
	ss01s.forEach( function( ss01 ) {
	    os.write( call_retr_edge( ss01, ss22 ) );
	});
    });

    analysis.retrs.forEach( function( ss12s, ss02 ) {
	ss12s.forEach( function( ss12 ) {
	    os.write( call_retr_edge( ss12, ss02 ) );
	});
    });
    
    os.write( "}\n" );
}

exports.vizualize = vizualize;
