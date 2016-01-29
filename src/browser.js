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
var analyze = require('./analysis/main').analyze;

// This is populated by the bundle.js browserify transform.
var packages = [];

var load = _.once(function() {
  // Load JS and headers from packages.
  packages.forEach(function(pkg) {
    console.log('package ' + pkg.name + ' loaded.');
    if (pkg.js) { global[pkg.js.identifier] = pkg.js.path; }
    pkg.headers.forEach(webppl.requireHeaderWrapper);
  });
  var extra = webppl.parsePackageCode(packages);
  console.log('webppl loaded.');
  return extra;
});

function run(code, k, verbose) {
  return webppl.run(code, k, { extra: load(), verbose: verbose });
}

function compile(code, verbose) {
  return webppl.compile(code, { extra: load(), verbose: verbose });
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
  analyze: analyze,
  runTrampoline: require('./transforms/trampoline').runner
};
