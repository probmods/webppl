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

function compile(code, verbose){
  var programAst = esprima.parse(code);

  // Load WPPL header
  var wpplHeaderAst = esprima.parse(fs.readFileSync(__dirname + "/header.wppl"));

  // Concat WPPL header and program code
  programAst.body = wpplHeaderAst.body.concat(programAst.body);

  // Apply naming transform to WPPL code
  var newProgramAst = naming(programAst);

  // Apply CPS transform to WPPL code
  newProgramAst = cps(newProgramAst, build.identifier("topK"));
  
  // Apply store passing transform to generated code
  newProgramAst = store(newProgramAst)

  // Optimize code
  newProgramAst = optimize(newProgramAst);

  // Print converted code
  if (verbose){
    var newCode = escodegen.generate(newProgramAst);
    var originalCode = escodegen.generate(programAst);
    console.log("\n* Original code:\n");
    console.log(originalCode);
    console.log("\n* CPS code:\n");
    console.log(newCode);
  }

  // Generate program code
  return escodegen.generate(newProgramAst);
}

function run(code, contFun, verbose){
  topK = contFun;  // Install top-level continuation
  var compiledCode = compile(code, verbose);
  return eval(compiledCode);
}

// Compile and run some webppl code in global scope:
// FIXME: merge this with run
function webppl_eval(k, code, verbose) {
  var oldk = global.topK;
  global.topK = function(s,x){  // Install top-level continuation
    k(s,x);
    global.topK = oldk;
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
