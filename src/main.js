'use strict';

var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');

var cps = require('./transforms/cps').cps;
var optimize = require('./transforms/optimize').optimize;
var naming = require('./transforms/naming').naming;
var store = require('./transforms/store').store;
var varargs = require('./transforms/varargs').varargs;
var trampoline = require('./transforms/trampoline').trampoline;
var thunkify = require('./syntax').thunkify;
var analyze = require('./analysis/analyze').analyze;
var util = require('./util');
var SourceMap = require('source-map');
var stacktraceParser = require('./stacktraceParser');


// Container for coroutine object and shared top-level
// functions (sample, factor, exit)
var env = {};

// Make header functions globally available:
var header = require('./header.js')(env);
for (var prop in header) {
  if (header.hasOwnProperty(prop)) {
    global[prop] = header[prop];
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

  // Parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode);
  var out = _prepare(concatPrograms(headerAST, programAST));

  if (verbose && console.timeEnd) {
    console.timeEnd('prepare');
  }
  return out;
}

function compile(programCode, verbose, programFile) {
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

  // Parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode, {loc: true, source: programFile});
  var out = escodegen.generate(_compile(concatPrograms(headerAST, programAST)), {
    sourceMap: true,
    sourceMapWithCode: true
  });

  if (verbose && console.timeEnd) {
    console.timeEnd('compile');
  }
  return {
    compiledCode: out.code,
    sourceMap: out.map.toString()
  };
}

function printStacktrace(code, compiledSourceMap, exception) {
  if (!exception.stack) {
    var webpplStack = exception;
    var jsStack = exception;
  } else {
    var webpplStack = stacktraceParser.getSourceMappedStacktrace(exception, compiledSourceMap, code);
    var jsStack = exception.stack;
  }
  console.log('  ------ Compiled JS Stack Trace ------');
  console.log(jsStack);
  console.log('\n  ------ Webppl Stack Trace ------');
  console.log(webpplStack);
}

function run(code, contFun, verbose) {
  var compiledResult = compile(code, verbose);
  var compiledCode = compiledResult.compiledCode;
  try {
    eval(compiledCode)({}, contFun, '');
  } catch (exception) {
    var compiledSourceMap = compiledResult.sourceMap;
    printStacktrace(code, compiledSourceMap, exception);
  }
}

// Compile and run some webppl code in global scope:
function webppl_eval(k, code, verbose) {
  var compiledResult = compile(code, verbose);
  var compiledCode = compiledResult.compiledCode;
  try {
    eval.call(global, compiledCode)({}, k, '');
  } catch (exception) {
    var compiledSourceMap = compiledResult.sourceMap;
    printStacktrace(code, compiledSourceMap, exception);
  }
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
    compile: compile,
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
