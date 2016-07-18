// Entry point for browserify.

'use strict';

var _ = require('underscore');
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

function run(code, k, options) {
  options = util.mergeDefaults(options, {
    filename: 'webppl:program',
    debug: false,
    errorHandlers: []
  });
  var handlers = options.debug ?
      [errors.debugHandler(options.filename)].concat(options.errorHandlers) :
      options.errorHandlers;
  options.errorHandlers = handlers;
  options.bundles = load();
  return webppl.run(code, k, options);
}

function compile(code, options) {
  if (options === undefined) {
    options = {};
  }
  var optionsExtended = _.extend({bundles: load()}, _.omit(options, 'sourceMap'));
  var codeAndMap = webppl.compile(code, optionsExtended);
  return options.sourceMap ? codeAndMap : codeAndMap.code;
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
  run: run,
  compile: compile,
  compileBase: webppl.compile,
  cps: webpplCPS,
  naming: webpplNaming,
  version: version,
  packages: packages
};
