'use strict';

var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

var cps = require('./transforms/cps').cps;
var optimize = require('./transforms/optimize').optimize;
var naming = require('./transforms/naming').naming;
var store = require('./transforms/store').store;
var varargs = require('./transforms/varargs').varargs;
var trampoline = require('./transforms/trampoline').trampoline;
var freevars = require('./transforms/freevars').freevars;
var caching = require('./transforms/caching').caching;
var thunkify = require('./syntax').thunkify;
var analyze = require('./analysis/main').analyze;
var util = require('./util');

// Container for coroutine object and shared top-level
// functions (sample, factor, exit)
var env = {};

// Make header functions globally available:
function requireHeader(path) { requireHeaderWrapper(require(path)); }
function requireHeaderWrapper(wrapper) { makePropertiesGlobal(wrapper(env)); }

function makePropertiesGlobal(obj) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      global[prop] = obj[prop];
    }
  }
}

// Explicitly call require here to ensure that browserify notices that the
// header should be bundled.
requireHeaderWrapper(require('./header'));

function concatPrograms(p0, p1) {
  return build.program(p0.body.concat(p1.body));
}

function cachingRequired(programAST) {
  var flag = false;
  estraverse.traverse(programAST, {
    enter: function(node) {
      if (node.type === 'Identifier' && node.name === 'IncrementalMH') {
        flag = true;
        this.break();
      }
    }
  });
  return flag;
}

function prepare(programCode, verbose, doCaching) {
  if (verbose && console.time) {
    console.time('prepare');
  }

  var _prepare = function(ast) {
    // ast = freevars(ast);
    ast = thunkify(ast);
    ast = naming(ast);
    ast = cps(ast);
    ast = optimize(ast);
    return ast;
  };

  // Parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode);
  // if (doCaching)
  //   programAST = caching(programAST);

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
    if (doCaching)
      ast = freevars(ast);
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
  var programAST = esprima.parse(programCode);

  var doCaching = cachingRequired(programAST);

  if (doCaching) {
    if (verbose) console.log('Caching transforms will be applied.');
    programAST = caching(programAST);
  }

  var out = escodegen.generate(_compile(concatPrograms(headerAST, programAST)));

  if (verbose && console.timeEnd) {
    console.timeEnd('compile');
  }
  return out;
}

// TODO: Understand the difference between run and webpplEval.
// If I switch ./webppl to use run rather than webpplEval, it's not obvious what
// changes.

// Called by browser.js
function run(code, contFun, verbose) {
  var compiledCode = compile(code, verbose);
  eval(compiledCode)({}, contFun, '');
}

// Called by ./webppl
// Compile and run some webppl code in global scope:
function webpplEval(k, code, verbose) {
  var compiledCode = compile(code, verbose);
  eval.call(global, compiledCode)({}, k, '');
}

if (!util.runningInBrowser()) {
  // Put eval into global scope. browser version??
  // Or move to ./webppl of only used outside of the browser.
  global.webpplEval = webpplEval;
}

module.exports = {
  requireHeader: requireHeader,
  requireHeaderWrapper: requireHeaderWrapper,
  webpplEval: webpplEval,
  run: run,
  prepare: prepare,
  compile: compile,
  analyze: analyze
};
