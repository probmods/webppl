'use strict';

var webppl = require('../src/main');

var wpplPkgEntry = function(code) { return { code: code, filename: '' }; };

var pkg1 = {
  wppl: ['var inc = function(x) { x + 1 };' +
         'var fnWithMacro = function() { return m1; };' +
         'var fnWithHeaderMacro = function() { 1 |> inc };'].map(wpplPkgEntry),
  macros: ["macro m1 { rule {} => { 'macro' } }; export m1;"]
};

var pkg2 = {
  wppl: ['var fnWithPkg1Macro = function() { m1 };' +
         'var fnWithPkg2Macro = function() { m2 };'].map(wpplPkgEntry),
  macros: ["macro m2 { rule {} => { 'macro2' } }; export m2;"]
};

var wpplRunWithPkgs = function(code, packages) {
  var val;
  var bundles = webppl.parsePackageCode(packages);
  webppl.run(code, function(s, v) { val = v; }, { bundles: bundles });
  return val;
};

module.exports = {
  testPkgMacrosAppliedToProgram: function(test) {
    test.strictEqual('macro', wpplRunWithPkgs('m1', [pkg1]));
    test.done();
  },
  testPkgMacrosAppliedToPkg: function(test) {
    test.strictEqual('macro', wpplRunWithPkgs('fnWithMacro()', [pkg1]));
    test.done();
  },
  testHeaderMacrosAppliedToPkg: function(test) {
    test.strictEqual(2, wpplRunWithPkgs('fnWithHeaderMacro()', [pkg1]));
    test.done();
  },
  testPkgMacrosNotAppliedToOtherPkg: function(test) {
    test.strictEqual('macro2', wpplRunWithPkgs('fnWithPkg2Macro()', [pkg1, pkg2]));
    test.throws(function() {
      wpplRunWithPkgs('fnWithPkg1Macro()', [pkg1, pkg2]);
    }, /m1 is not defined/);
    test.done();
  }
};
