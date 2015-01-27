"use strict";

var readFile = require('fs').readFileSync;
var esprima = require("esprima");
var build = require("ast-types").builders;
var naming = require("../src/naming.js").naming;
var cps = require("../src/cps.js").cps;
var store = require("../src/store").store;
var optimize = require("../src/optimize.js").optimize;
var analyze = require("../src/analyze.js").analyze;

var Set = require("immutable").Set;

function compile( code, verbose ) {
  if( verbose && console.time ) {
    console.time('compile');
  }

  var headAst = esprima.parse( readFile( __dirname + "/../src/header.wppl" ) ).body;
  var codeAst = esprima.parse( code ).body;

  var ast = build.program( headAst.concat( codeAst ) );  

  ast = naming( ast );
  ast = cps( ast, build.identifier("topK") );
  //ast = store( ast );
  ast = optimize( ast );

  if( verbose && console.timeEnd ) {
    console.timeEnd('compile');
  }
  
  return ast;
}

var tests = {
    constant: {
	program: "3 + 4",
	results: Set.of( 7 )
    },
    call: {
	program: "flip(0.5)",
	results: Set.of( true, false )
	
    },
    recursion: {
	program: "\
var geom = function() {\n\
    return flip() ? 0 : 1 + geom();\n\
}\n\
geom();",
	results: new Set()
    }
}

function makeTest( t ) {
    return function( test ) {
	if( t.results.isSubset( analyze( compile( t.program ), build.identifier("topK") ) ) ) {
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

