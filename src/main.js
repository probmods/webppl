'use strict';

var assert = require('assert');
var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');

var cps = require('./cps').cps;
var optimize = require('./optimize').optimize;
var naming = require('./naming').naming;
var store = require('./store').store;
var varargs = require('./varargs').varargs;
var trampoline = require('./trampoline').trampoline;
var thunkify = require('./util2').thunkify;
var analyze = require('./analysis/analyze').analyze;
var util = require('./util');


// Container for coroutine object and shared top-level
// functions (sample, factor, exit)
var env = {};

// Make runtime stuff globally available:
var runtime = require('./header.js')(env);
for (var prop in runtime) {
  if (runtime.hasOwnProperty(prop)) {
    global[prop] = runtime[prop];
  }
}

function concatPrograms(p0, p1) {
  return build.program(p0.body.concat(p1.body));
}

function prepare(programCode, verbose) {
  if (verbose && console.time) {
    console.time('prepare');
  }

  var _prepare = function(ast) {
    ast = thunkify(ast);
    ast = naming(ast);
    ast = cps(ast);
    ast = optimize(ast);
    return ast;
  };

  // parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode);
  var out = _prepare(concatPrograms(headerAST, programAST));

  if (verbose && console.timeEnd) {
    console.timeEnd('prepare');
  }
  return out;
}

function compile(programCode, verbose) {
  if (verbose && console.time) {
    console.time('compile');
  }

  var _compile = function(ast) {
    ast = thunkify(ast);
    ast = naming(ast);
    ast = cps(ast);
    ast = store(ast);
    ast = optimize(ast);
    ast = varargs(ast);
    ast = trampoline(ast);
    return ast;
  };

  // parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode);
  var out = escodegen.generate(_compile(concatPrograms(headerAST, programAST)));

  if (verbose && console.timeEnd) {
    console.timeEnd('compile');
  }
  return out;
}

function run(code, contFun, verbose) {
  var compiledCode = compile(code, verbose);
  eval(compiledCode)({}, contFun, '');
}

// Compile and run some webppl code in global scope:
function webppl_eval(k, code, verbose) {
  var compiledCode = compile(code, verbose);
  eval.call(global, compiledCode)({}, k, '');
}

// For use in browser
function webpplCPS(code) {
  var programAst = esprima.parse(code);
  var newProgramAst = optimize(cps(programAst));
  return escodegen.generate(newProgramAst);
}

function webpplNaming(code) {
  var programAst = esprima.parse(code);
  var newProgramAst = naming(programAst);
  return escodegen.generate(newProgramAst);
}

// For use in browser using browserify
if (util.runningInBrowser()) {
  window.webppl = {
    run: run,
    compile: compileProgram,
    cps: webpplCPS,
    naming: webpplNaming,
    analyze: analyze
  };
  console.log('webppl loaded.');
} else {
  // Put eval into global scope. browser version??
  global.webppl_eval = webppl_eval;
}

module.exports = {
  webppl_eval: webppl_eval,
  run: run,
  prepare: prepare,
  compile: compile,
  analyze: analyze
};
