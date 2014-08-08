"use strict";

var fs = require('fs');
var path = require('path');
var types = require("ast-types");
var build = types.builders;
var esprima = require("esprima");
var escodegen = require("escodegen");
var cps = require("./cps.js").cps;
var util = require("./util.js");

var runningAsScript = require.main === module;
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
  var wpplHeaderFile = path.resolve(__dirname, "header.wppl");
  var wpplHeaderAst = esprima.parse(fs.readFileSync(wpplHeaderFile));

  // Concat WPPL header and program code
  programAst.body = wpplHeaderAst.body.concat(programAst.body);

  // Apply CPS transform to WPPL code
  var newProgramAst = cps(programAst, build.identifier("topK"));

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

module.exports = {
  run: run,
  compile: compile
};
