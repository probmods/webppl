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
var addFilename = require('./transforms/addFilename').addFilename;
var optimize = require('./transforms/optimize').optimize;
var naming = require('./transforms/naming').naming;
var store = require('./transforms/store').store;
var stack = require('./transforms/stack');
var varargs = require('./transforms/varargs').varargs;
var trampoline = require('./transforms/trampoline').trampoline;
var freevars = require('./transforms/freevars').freevars;
var caching = require('./transforms/caching');
var thunkify = require('./syntax').thunkify;
var util = require('./util');
var errors = require('./errors/errors');

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

function parse(code, macros, filename) {
  var compiled = sweet.compile(code, { readableNames: true, ast: true, modules: macros });
  return addFilename(compiled, filename);
}

function parseAll(bundles) {
  return bundles.map(function(bundle) {
    var ast = parse(bundle.code, bundle.macros, bundle.filename);
    return _.extendOwn({ ast: ast }, bundle);
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
  var headerMacroModule = fs.readFileSync(__dirname + '/headerMacros.sjs', 'utf8');
  var dists = fs.readFileSync(__dirname + '/dists.wppl', 'utf8');
  var header = fs.readFileSync(__dirname + '/header.wppl', 'utf8');
  return { wppl: [
    { code: dists, filename: 'dists.wppl' },
    { code: header, filename: 'header.wppl' }
  ], macros: [headerMacroModule] };
}

function unpack(packages) {
  // Flatten an array of packages into an array of code bundles. A
  // bundle contains wppl source code, filename and associated macros.
  //
  // Package :: { wppl: [String], macros: [LoadedMacroModule] }
  // Bundle :: { code: String, filename: String, macros: [LoadedMacroModule] }
  //
  return _.chain(packages).map(function(pkg) {
    return pkg.wppl.map(function(wppl) {
      return { code: wppl.code, filename: wppl.filename, macros: pkg.macros };
    });
  }).flatten().value();
}

function addHeaderMacrosToEachBundle(bundles) {
  // This assumes that pair[0] is the content of the header.
  assert.ok(bundles.length >= 1 && bundles[0].macros.length === 1);
  var headerMacros = bundles[0].macros;
  return bundles.map(function(bundle, i) {
    return {
      code: bundle.code,
      filename: bundle.filename,
      macros: bundle.macros.concat(i > 0 ? headerMacros : [])
    };
  });
}

function parsePackageCode(packages, verbose) {
  // Takes an array of packages and turns them into an array of parsed
  // bundles. i.e. Each bundle (as returned by unpack) is augmented
  // with an ast.
  // The contents of the header are included at this stage.

  function _parsePackageCode() {
    var allPackages = [headerPackage()].concat(packages).map(loadMacros);

    return util.pipeline([
      unpack,
      addHeaderMacrosToEachBundle,
      parseAll
    ])(allPackages);
  }

  return util.timeif(verbose, 'parsePackageCode', _parsePackageCode);
}

function applyCaching(asts) {
  return asts.map(function(ast) {
    return caching.hasNoCachingDirective(ast) ? ast : caching.transform(ast);
  });
}

function copyAst(ast) {
  var ret = _.isArray(ast) ? [] : {};
  _.each(ast, function(val, key) {
    ret[key] = _.isObject(val) ? copyAst(val) : val;
  });
  return ret;
}

function generateCodeAndSourceMap(code, filename, bundles, ast) {
  var codeAndMap = escodegen.generate(ast, {
    sourceMap: true,
    sourceMapWithCode: true
  });
  var sourceMap = JSON.parse(codeAndMap.map);
  // Embed the original source in the source map for later use in
  // error handling.
  sourceMap.sourcesContent = sourceMap.sources.map(function(fn) {
    return (fn === filename) ? code : _.findWhere(bundles, {filename: fn}).code;
  });
  return {code: codeAndMap.code, sourceMap: sourceMap};
}

function compile(code, options) {
  options = util.mergeDefaults(options, {
    verbose: false,
    filename: 'webppl:program'
  });

  var bundles = options.bundles || parsePackageCode([], options.verbose);

  var addressMap;
  var saveAddressMap = function(obj) {
    addressMap = obj.map;
    return obj.ast;
  };

  var transforms = options.transforms || [
    thunkify,
    naming,
    saveAddressMap,
    varargs,
    cps,
    store,
    optimize,
    options.debug ? stack.transform : _.identity,
    trampoline,
    stack.wrapProgram
  ];

  function _compile() {
    var macros = _.chain(bundles).pluck('macros').flatten().uniq().value();
    var programAst = parse(code, macros, options.filename);
    var asts = _.pluck(bundles, 'ast').map(copyAst).concat(programAst);
    assert.strictEqual(bundles[0].filename, 'dists.wppl');
    assert.strictEqual(bundles[1].filename, 'header.wppl');
    var doCaching = _.any(asts.slice(2), caching.transformRequired);

    if (options.verbose && doCaching) {
      console.log('Caching transform will be applied.');
    }

    var generateCodeAndAssets = function(ast) {
      var obj = generateCodeAndSourceMap(code, options.filename, bundles, ast);
      obj.addressMap = addressMap;
      return obj;
    };

    return util.pipeline([
      doCaching ? applyCaching : _.identity,
      concatPrograms,
      doCaching ? freevars : _.identity,
      util.pipeline(transforms),
      generateCodeAndAssets
    ])(asts);
  };

  return util.timeif(options.verbose, 'compile', _compile);
}

function wrapWithHandler(f, handler) {
  return function(x, y) {
    try {
      return f(x, y);
    } catch (e) {
      handler(e);
    }
  };
}

function wrapRunner(baseRunner, handlers) {
  var wrappedRunner = handlers.reduce(wrapWithHandler, baseRunner);
  var runner = function(t) { return wrappedRunner(t, runner); };
  return runner;
}


function prepare(codeAndAssets, k, options) {
  options = util.mergeDefaults(options, {
    errorHandlers: [],
    initialStore: {}
  });

  var currentAddress = {value: undefined};
  var defaultHandler = function(error) {
    errors.extendError(error, codeAndAssets, currentAddress);
    throw error;
  };
  var allErrorHandlers = [defaultHandler].concat(options.errorHandlers);

  // Wrap base runner with all error handlers.
  var baseRunner = options.baseRunner || util.trampolineRunners[util.runningInBrowser() ? 'web' : 'cli']();
  var runner = wrapRunner(baseRunner, allErrorHandlers);

  var run = function() {
    // We reset env since a previous call to run may have raised an
    // exception and left an inference coroutine installed.
    env.reset();
    eval.call(global, codeAndAssets.code)(currentAddress)(runner)(options.initialStore, k, '');
  };

  return {run: run, runner: runner};
}

function run(code, k, options) {
  options = options || {};
  var codeAndAssets = compile(code, options);
  util.timeif(options.verbose, 'run', prepare(codeAndAssets, k, options).run);
}

// Make webppl eval available within webppl
// runner is one of 'cli','web'
global.webpplEval = function(s, k, a, code, runnerName) {
  if (runnerName === undefined) {
    runnerName = util.runningInBrowser() ? 'web' : 'cli'
  }

  // On error, throw out the stack. We don't support recovering the
  // stack from here.
  var handler = function(error) {
    throw 'webpplEval error:\n' + error;
  };
  var baseRunner = util.trampolineRunners[runnerName]();
  var runner = wrapRunner(baseRunner, [handler]);

  var compiledCode = compile(code, {filename: 'webppl:eval'}).code;
  return eval.call(global, compiledCode)({})(runner)(s, k, a);
};

module.exports = {
  requireHeader: requireHeader,
  requireHeaderWrapper: requireHeaderWrapper,
  parsePackageCode: parsePackageCode,
  prepare: prepare,
  run: run,
  compile: compile
};
