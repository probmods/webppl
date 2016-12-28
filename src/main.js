'use strict';

var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');
var assert = require('assert');
var _ = require('lodash');

var ad = require('./transforms/ad').ad;
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
var params = require('./params/params');

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

function parse(code, filename) {
  var ast = esprima.parse(code, {loc: true});
  return addFilename(ast, filename);
}

function parseAll(bundles) {
  return bundles.map(function(bundle) {
    var ast = parse(bundle.code, bundle.filename);
    return _.assign({ ast: ast }, bundle);
  });
}

function headerPackage() {
  // Create a pseudo package from the header.
  var dists = fs.readFileSync(__dirname + '/dists.wppl', 'utf8');
  var header = fs.readFileSync(__dirname + '/header.wppl', 'utf8');
  return { wppl: [
    { code: dists, filename: 'dists.wppl' },
    { code: header, filename: 'header.wppl' }
  ]};
}

function unpack(packages) {
  // Flatten an array of packages into an array of code bundles. A
  // bundle contains wppl source code and its filename.
  //
  // Package :: { wppl: [{ code: ..., filename: ... }] }
  // Bundle :: { code: String, filename: String }
  //
  return _.chain(packages).map(function(pkg) {
    return pkg.wppl.map(function(wppl) {
      return { code: wppl.code, filename: wppl.filename };
    });
  }).flatten().value();
}

function parsePackageCode(packages, verbose) {
  // Takes an array of packages and turns them into an array of parsed
  // bundles. i.e. Each bundle (as returned by unpack) is augmented
  // with an ast.
  // The contents of the header are included at this stage.

  function _parsePackageCode() {
    var allPackages = [headerPackage()].concat(packages);

    return _.flow([
      unpack,
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
    return (fn === filename) ? code : _.find(bundles, {filename: fn}).code;
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
    ad,
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
    var programAst = parse(code, options.filename);
    var asts = _.map(bundles, 'ast').map(copyAst).concat(programAst);
    assert.strictEqual(bundles[0].filename, 'dists.wppl');
    assert.strictEqual(bundles[1].filename, 'header.wppl');
    var doCaching = _.some(asts.slice(2), caching.transformRequired);

    if (options.verbose && doCaching) {
      console.log('Caching transform will be applied.');
    }

    var generateCodeAndAssets = function(ast) {
      var obj = generateCodeAndSourceMap(code, options.filename, bundles, ast);
      obj.addressMap = addressMap;
      return obj;
    };

    return _.flow([
      doCaching ? applyCaching : _.identity,
      concatPrograms,
      doCaching ? freevars : _.identity,
      _.flow(transforms),
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

  // We store the trampoline runner so that header functions that call
  // external asynchronous functions can resume execution in callbacks.
  global.trampolineRunner = runner;

  // Before the program finishes, we tell the param store to finish up
  // gracefully (e.g., shutting down a connection to a remote store).
  var finish = function(s, x) {
    return params.stop(function() {
      return k(s, x);
    });
  };

  var run = function() {
    // We reset env since a previous call to run may have raised an
    // exception and left an inference coroutine installed.
    env.reset();
    // We initialize the parameter store (e.g., connecting to a remote
    // store, retrieving params).
    params.init(function() {
      var wpplFn = eval.call(global, codeAndAssets.code)(currentAddress)(runner);
      var initialAddress = '';
      return wpplFn(options.initialStore, finish, initialAddress);
    });
  };

  return { run: run };
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
