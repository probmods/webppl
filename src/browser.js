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

// These are populated by the bundle.js browserify transform.
var version = '';
var packages = [];

var load = _.once(function() {
  // Load JS and headers from packages.
  packages.forEach(function(pkg) {
    console.log('loaded ' + pkg.name + ' [' + pkg.version + ']');
    if (pkg.js) { global[pkg.js.identifier] = pkg.js.path; }
    pkg.headers.forEach(webppl.requireHeaderWrapper);
  });
  var bundles = webppl.parsePackageCode(packages);
  console.log('loaded webppl [' + version + ']');
  return bundles;
});

function run(code, k, options) {
  if (options === undefined) {
    options = {};
  }
  var optionsExtended = _.extend({bundles: load()}, options);
  webppl.resetEnv();
  return webppl.run(code, k, optionsExtended);
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
  var newProgramAst = naming(thunkify(programAst));
  return escodegen.generate(newProgramAst);
}

global.webppl = {
  run: run,
  compile: compile,
  cps: webpplCPS,
  naming: webpplNaming,
  version: version,
  resetEnv: webppl.resetEnv
};
