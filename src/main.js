"use strict";

var assert = require('assert');
var fs = require('fs');
var types = require("ast-types");
var build = types.builders;
var esprima = require("esprima");
var escodegen = require("escodegen");
var cps = require("./cps").cps;
var optimize = require("./optimize").optimize;
var naming = require("./naming").naming;
var store = require("./store").store;
var varargs = require("./varargs").varargs;
var trampoline = require("./trampoline").trampoline;
var util = require("./util");

// Make runtime stuff globally available:
var runtime = require("./header.js");
for (var prop in runtime){
  if (runtime.hasOwnProperty(prop)){
    global[prop] = runtime[prop];
  }
}

function concatPrograms( p0, p1 ) {
    return build.program( p0.body.concat( p1.body ) );
}

function removeFinalContinuationCall(ast, contName){
  var x = ast.body[0];
  var lastNode = x.body[x.body.length-1];
  assert(types.namedTypes.ExpressionStatement.check(lastNode));
  assert(types.namedTypes.CallExpression.check(lastNode.expression));
  assert(types.namedTypes.Identifier.check(lastNode.expression.callee));
  assert.equal(lastNode.expression.callee.name, contName);
  x.body = x.body.slice(0, x.body.length-1);
}

var compile = function(code, contName, isLibrary){
  var ast = esprima.parse(code);
  var cont = build.identifier(contName);
  ast = naming(ast);
  ast = cps(ast, cont);
  if (isLibrary){
    // library contains only function definitions, so remove
    // unnecessary final dummy continuation call
    removeFinalContinuationCall(ast, contName);
  }
  ast = store(ast);
  ast = optimize(ast);
  ast = varargs(ast);
  ast = trampoline(ast, isLibrary);
  return ast;
};

function compileProgram(programCode, verbose){
  if (verbose && console.time){console.time('compile');}

  function UpdateTopLevel( prog, f ) {
    return build.program([this.body[0].updateTopLevel( f )]);
  }
    
  var _compile = function( ast ){
    console.log( escodegen.generate( ast ) );
    ast = naming(ast);
    ast = cps(ast);
//  ast = store(ast);
    console.log( escodegen.generate( ast ) );  
    ast = UpdateTopLevel( ast, optimize );
//  ast = trampoline(ast);
    console.log( escodegen.generate( ast ) );
    throw 42;
    return ast;
  };

  // parse header and program, combine, compile, and generate program
  var out = escodegen.generate( _compile( concatPrograms( esprima.parse( fs.readFileSync(__dirname + "/header.wppl") ),
							  esprima.parse( programCode ) ) ) );

  if (verbose && console.timeEnd){console.timeEnd('compile');}
  return out;
}

function run(code, contFun, verbose){
  var compiledCode = compile(code, verbose);
  return eval(compiledCode)( {}, contFun, "" );
}

// Compile and run some webppl code in global scope:
function webppl_eval(k, code, verbose) {
  var compiledCode = compile(code, verbose);
    eval.call(global, compiledCode)( {}, k, "" );
}

// For use in browser
function webpplCPS(code){
  var programAst = esprima.parse(code);
  var newProgramAst = optimize(cps(programAst));
  return escodegen.generate(newProgramAst);
}

function webpplNaming(code){
  var programAst = esprima.parse(code);
  var newProgramAst = naming(programAst);
  return escodegen.generate(newProgramAst);
}

// For use in browser using browserify
if (util.runningInBrowser()){
  window.webppl = {
    run: run,
    compile: compileProgram,
    cps: webpplCPS,
    naming: webpplNaming
  };
  console.log("webppl loaded.");
} else {
  // Put eval into global scope. browser version??
  global.webppl_eval = webppl_eval;
}

module.exports = {
  webppl_eval: webppl_eval,
  run: run,
  compile: compileProgram,
  compileRaw: compile
};
