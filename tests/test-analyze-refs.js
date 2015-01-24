"use strict";

var readFile = require('fs').readFileSync;
var esprima = require("esprima");
var build = require("ast-types").builders;
var naming = require("../src/naming.js").naming;
var cps = require("../src/cps.js").cps;
var store = require("../src/store").store;
var optimize = require("../src/optimize.js").optimize;
var analyze = require("../src/analyze.js").analyze;

function compile( code, verbose ) {
  if( verbose && console.time ) {
    console.time('compile');
  }

  var headAst = esprima.parse( readFile( __dirname + "/../src/header.wppl" ) ).body;
  var codeAst = esprima.parse( code ).body;

  var ast = build.program( headAst.concat( codeAst ) );  

  ast = naming( ast );
  ast = cps( ast, build.identifier("topK") );
  ast = optimize( ast );

  if( verbose && console.timeEnd ) {
    console.timeEnd('compile');
  }
  
  return ast;
}

var tests = {
    constant: {
	program: "3 + 4"
    },
    call: {
	program: "flip(0.5)"
    },
    recursion: {
	program: "\
var geom = function() {\n\
    return flip() ? 0 : 1 + geom();\n\
}\n\
geom();"
    }
}

function makeTest( p ) {
    return function( test ) {
	console.log( analyze( compile( p ), build.identifier("topK") ) );
	test.done();
    }
}

exports.test = (function( tests ) {
    var testfs = {};
    
    for( var test in tests ) {
	if( tests.hasOwnProperty( test ) ) {
	    testfs[ test ] = makeTest( tests[ test ].program );
	}
    }

    return testfs;
})( tests );
