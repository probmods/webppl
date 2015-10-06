'use strict';

var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var assert = require('assert');
var _ = require('underscore');
var sweet = require('sweet.js');

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

function concatPrograms(programs) {
  assert.ok(_.isArray(programs));
  var concat = function(p0, p1) {
    return build.program(p0.body.concat(p1.body));
  };
  var emptyProgram = esprima.parse('');
  return programs.reduce(concat, emptyProgram);
}

function parse(code, macros) {
  return sweet.compile(code, { readableNames: true, ast: true, modules: macros });
}

function parseExtra(extra) {
  return parse(extra.wppl, extra.macros);
}

function loadMacros(pkg) {
  return {
    wppl: pkg.wppl,
    macros: pkg.macros.map(function(code) { return sweet.loadModule(code); })
  };
}

function expandPackages(packages, headerMacros) {
  // Returns an array with one entry for each wppl file in packages.
  // Each entry is associated with the macros which will be applied to
  // that file.
  return _.chain(packages).map(function(pkg) {
    var macros = pkg.macros.concat(headerMacros);
    return pkg.wppl.map(function(wppl) {
      return { wppl: wppl, macros: macros };
    });
  }).flatten().value();
}

function prepareExtras(packages) {
  // Takes an array of packages and turns them into an array of ASTs
  // (one for each wppl file plus one for the header) where macros
  // have been expanded. Also collects together all macros in
  // preparation for parsing the program.
  var packages = (packages !== undefined) ? packages.map(loadMacros) : [];
  var headerCode = fs.readFileSync(__dirname + '/header.wppl', 'utf8');
  var headerModule = sweet.loadModule(fs.readFileSync(__dirname + '/headerMacros.sjs', 'utf8'));
  var packageModules = _.chain(packages).pluck('macros').flatten().value();
  var headerExtra = { wppl: headerCode, macros: [headerModule] };
  var packageExtras = expandPackages(packages, headerModule);
  var asts = [headerExtra].concat(packageExtras).map(parseExtra);
  var macros = [headerModule].concat(packageModules);
  return { asts: asts, macros: macros };
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

function applyCaching(asts) {
  // This assume that asts[0] is the header.
  return asts.map(function(ast, i) {
    return i > 0 ? caching(ast) : ast;
  });
}

function compile(code, extras, verbose) {
  var extras = extras || prepareExtras();

  function _compile() {
    var programAst = parse(code, extras.macros);
    var asts = extras.asts.concat(programAst);
    var doCaching = _.any(asts, cachingRequired);

    if (verbose && doCaching) {
      console.log('Caching transform will be applied.');
    }

    var compilationPipeline = util.pipeline([
      doCaching ? freevars : _.identity,
      thunkify,
      naming,
      cps,
      store,
      optimize,
      varargs,
      trampoline
    ]);

    return util.pipeline([
      doCaching ? applyCaching : _.identity,
      concatPrograms,
      compilationPipeline,
      escodegen.generate
    ])(asts);
  };

  return util.timeif(verbose, 'compile', _compile);
}

function prepare(code, verbose) {
  function _prepare() {
    var extras = prepareExtras();
    var programAst = parse(code, extras.macros);
    var asts = extras.asts.concat(programAst);
    var preparationPipeline = util.pipeline([
      thunkify,
      naming,
      cps,
      optimize
    ]);
    return preparationPipeline(concatPrograms(asts));
  }

  return util.timeif(verbose, 'prepare', _prepare);
}

function run(code, k, extras, verbose) {
  var compiledCode = compile(code, extras, verbose);
  util.timeif(verbose, 'run', function() {
    eval.call(global, compiledCode)({}, k, '');
  });
}

// Make webppl eval available within webppl
global.webpplEval = function(s, k, a, code) {
  var compiledCode = compile(code);
  return eval.call(global, compiledCode)(s, k, a);
};

module.exports = {
  requireHeader: requireHeader,
  requireHeaderWrapper: requireHeaderWrapper,
  prepareExtras: prepareExtras,
  run: run,
  prepare: prepare,
  compile: compile,
  analyze: analyze
};
