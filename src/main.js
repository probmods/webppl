"use strict";

var fs = require('fs');
var path = require('path');
var types = require("ast-types");
var build = types.builders;
var esprima = require("esprima");
var escodegen = require("escodegen");
var cps = require("./cps.js").cps;
var optimize = require("./optimize.js").optimize;
var naming = require("./naming.js").naming;
var store = require("./store").store;
var util = require("./util.js");

var topK;

// Make runtime stuff globally available:
var runtime = require("./header.js");
for (var prop in runtime){
  if (runtime.hasOwnProperty(prop)){
    global[prop] = runtime[prop];
  }
}

global['CACHED_WEBPPL_HEADER'] = undefined;

function addHeaderAst(targetAst, headerAst){
  targetAst.body = headerAst.body.concat(targetAst.body);
  return targetAst;
}

function compile(programCode, verbose){
  if (console.time){console.time('compile');}

  var programAst, headerAst;

  var _compile = function(code, contName){
    var ast = esprima.parse(code);
    ast = naming(ast);
    ast = cps(ast, build.identifier(contName));
    ast = store(ast);
    ast = optimize(ast);
    return ast;
  };

  // Compile & cache WPPL header
  if (global.CACHED_WEBPPL_HEADER){
    headerAst = global.CACHED_WEBPPL_HEADER;
  } else {
    var headerCode = fs.readFileSync(__dirname + "/header.wppl");
    headerAst = _compile(headerCode, 'dummyCont');
    // remove final continuation call, since header contains only defs
    headerAst.body = headerAst.body.slice(0, headerAst.body.length-1);
    global['CACHED_WEBPPL_HEADER'] = headerAst;
  }

  // Compile program code
  programAst = _compile(programCode, 'topK');
  console.log(escodegen.generate(programAst));

  // Concatenate header and program
  var out = escodegen.generate(addHeaderAst(programAst, headerAst));

  if (console.timeEnd){console.timeEnd('compile');}
  return out;
}

function run(code, contFun, verbose){
  topK = contFun;  // Install top-level continuation
  var compiledCode = compile(code, verbose);
  return eval(compiledCode);
}

// Compile and run some webppl code in global scope:
function webppl_eval(k, code, verbose) {
  var oldk = global.topK;
  global.topK = function(s,x){  // Install top-level continuation
    k(s,x);
    global.topK = oldk;
    // FIXME: This may not work correctly if the evaluated code
    // uses setTimeout/setInterval
  };
  var compiledCode = compile(code, verbose);
  eval.call(global, compiledCode);
}

// For use in browser
function webpplCPS(code){
  var programAst = esprima.parse(code);
  var newProgramAst = cps(programAst, build.identifier("topK"));
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
    compile: compile,
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
  compile: compile
};
