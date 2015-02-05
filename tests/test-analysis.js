"use strict";

var readFile = require('fs').readFileSync;
var esprima = require("esprima");
var build = require("ast-types").builders;
var naming = require("../src/naming.js").naming;
var cps = require("../src/cps.js").cps;
var store = require("../src/store").store;
var optimize = require("../src/optimize.js").optimize;
var analyze = require("../src/analyze.js").analyze;

var thunkify = require("../src/util2").thunkify;

var Set = require("immutable").Set;

function compile( code, verbose ) {
    var headAst = esprima.parse( readFile( __dirname + "/../src/header.wppl" ) ).body;
    var codeAst = esprima.parse( code ).body;

    var ast = build.program( headAst.concat( codeAst ) );  
    ast = thunkify( ast );
    ast = naming( ast );
    ast = cps( ast );
    //ast = store( ast );
    ast = optimize( ast );

    return ast;
}

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
	var results = analyze( compile( t.program ) );

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

