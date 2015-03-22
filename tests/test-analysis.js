"use strict";

var prepare = require("../src/main").prepare;
var analyze = require("../src/analyze").analyze;

var Set = require("immutable").Set;

var tests = {
    constant: {
	program: "3 + 4",
	values: Set.of( 7 )
    },
    call: {
	program: "flip(0.5)",
	values: Set.of( true, false )
	
    },
    recursion: {
	program: "\
var geom = function() {\n\
    return flip(0.5) ? 0 : 1 + geom();\n\
}\n\
geom();",
	values: Set.of( 0 )
    }
}

function makeTest( t ) {
    return function( test ) {
	var results = analyze( prepare( t.program ) );

	var values = results.reduce( function( values, result ) {
	    return values.union( result.values );
	}, new Set() );
	
	if( t.values.isSubset( values ) ) {
	    test.ok( true );
	}
	else {
	    test.ok( false, "analyzer is unsound (or test is wrong)" );
	}

	test.done();
    }
}

exports.test = (function( tests ) {
    var testfs = {};
    
    for( var test in tests ) {
	if( tests.hasOwnProperty( test ) ) {
	    testfs[ test ] = makeTest( tests[ test ] );
	}
    }

    return testfs;
})( tests );

