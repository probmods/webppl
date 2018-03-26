// Entry point for browserify.

'use strict';

var _ = require('lodash');
var fs = require('fs');
var esprima = require('esprima');
var escodegen = require('escodegen');
var webppl = require('./main');
var optimize = require('./transforms/optimize').optimize;
var naming = require('./transforms/naming').naming;
var thunkify = require('./syntax').thunkify;
var cps = require('./transforms/cps').cps;
var errors = require('./errors/browser');
var util = require('./util');

// These are populated by the bundle.js browserify transform.
var version = '';
var packages = [];

var load = _.once(function() {
  // Load JS and headers from packages.
  packages.forEach(function(pkg) {
    if (pkg.js) { global[pkg.js.identifier] = pkg.js.path; }
    pkg.headers.forEach(webppl.requireHeaderWrapper);
  });
  var bundles = webppl.parsePackageCode(packages);
  return bundles;
});

function prepare(codeAndAssets, k, options) {
  options = util.mergeDefaults(options, {
    filename: 'webppl:program',
    errorHandlers: []
  });
  var extraHandlers = options.debug ? [errors.debugHandler(options.filename)] : [];
  options.errorHandlers = extraHandlers.concat(options.errorHandlers);
  return webppl.prepare(codeAndAssets, k, options);
}

function run(code, k, options) {
  var codeAndAssets = compile(code, options);
  prepare(codeAndAssets, k, options).run();
}

function compile(code, options) {
  options = options || {};
  var optionsExtended = _.extend({bundles: load()}, options);
  return webppl.compile(code, optionsExtended);
}

function webpplCPS(code) {
  var programAst = esprima.parse(code);
  var newProgramAst = optimize(cps(thunkify(programAst)));
  return escodegen.generate(newProgramAst);
}

function webpplNaming(code) {
  var programAst = esprima.parse(code);
  var newProgramAst = naming(thunkify(programAst)).ast;
  return escodegen.generate(newProgramAst);
}

global.webppl = {
  prepare: prepare,
  run: run,
  compile: compile,
  cps: webpplCPS,
  naming: webpplNaming,
  version: version,
  packages: packages
};
