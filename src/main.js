'use strict';

var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');
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
var caching = require('./transforms/caching');
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

function parseAllPairs(pairs) {
  return pairs.map(function(pair) {
    return parse(pair.code, pair.macros);
  });
}

function loadMacros(pkg) {
  return {
    wppl: pkg.wppl,
    macros: pkg.macros.map(function(code) { return sweet.loadModule(code); })
  };
}

function headerPackage() {
  // Create a pseudo package from the header.
  var code = fs.readFileSync(__dirname + '/header.wppl', 'utf8');
  var macroModule = fs.readFileSync(__dirname + '/headerMacros.sjs', 'utf8');
  return { wppl: [code], macros: [macroModule] };
}

function packagesToPairs(packages) {
  // Transform an array of packages into an array of pairs. A pair
  // contains a string of WebPPL code and an array of macros required
  // to parse that code.

  // Package :: { wppl: [String], macros: [LoadedMacroModule] }
  // Pair :: { code: String, macros: [LoadedMacroModule] }

  return _.chain(packages).map(function(pkg) {
    return pkg.wppl.map(function(wppl) {
      return { code: wppl, macros: pkg.macros };
    });
  }).flatten().value();
}

function addHeaderMacrosToEachPair(pairs) {
  // This assumes that pair[0] is the content of the header.
  assert.ok(pairs.length >= 1 && pairs[0].macros.length === 1);
  var headerMacros = pairs[0].macros[0];
  return pairs.map(function(pair) {
    return { code: pair.code, macros: pair.macros.concat(headerMacros) };
  });
}

function parsePackageCode(packages, verbose) {
  // Takes an array of packages and turns them into an array of ASTs
  // in which macros have been expanded. The contents of the header
  // are included at this stage.
  //
  // As a convinience, an array of all macros (header + packages) is
  // also returned in preparation for parsing the main program.
  //
  function _parsePackageCode() {
    var allPackages = [headerPackage()].concat(packages).map(loadMacros);
    var macros = _.chain(allPackages).pluck('macros').flatten().value();

    var asts = util.pipeline([
      packagesToPairs,
      addHeaderMacrosToEachPair,
      parseAllPairs
    ])(allPackages);

    return { asts: asts, macros: macros };
  }

  return util.timeif(verbose, 'parsePackageCode', _parsePackageCode);
}

function applyCaching(asts) {
  // This assume that asts[0] is the header.
  return asts.map(function(ast, i) {
    return i > 0 ? caching.transform(ast) : ast;
  });
}

function compile(code, options) {
  var options = util.mergeDefaults(options, { verbose: false, generateCode: true });

  var extra = options.extra || parsePackageCode([], options.verbose);
  var transforms = options.transforms || [
    thunkify,
    naming,
    cps,
    store,
    optimize,
    varargs,
    trampoline
  ];

  function _compile() {
    var programAst = parse(code, extra.macros);
    var asts = extra.asts.concat(programAst);
    var doCaching = _.any(asts, caching.transformRequired);

    if (options.verbose && doCaching) {
      console.log('Caching transform will be applied.');
    }

    return util.pipeline([
      doCaching ? applyCaching : _.identity,
      concatPrograms,
      doCaching ? freevars : _.identity,
      util.pipeline(transforms),
      options.generateCode ? escodegen.generate : _.identity
    ])(asts);
  };

  return util.timeif(options.verbose, 'compile', _compile);
}

function run(code, k, options) {
  var options = options || {};
  var compiledCode = compile(code, options);
  util.timeif(options.verbose, 'run', function() {
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
  parsePackageCode: parsePackageCode,
  run: run,
  compile: compile,
  analyze: analyze
};
