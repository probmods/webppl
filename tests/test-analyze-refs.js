'use strict';

var readFile = require('fs').readFileSync;
var esprima = require('esprima');
var build = require('ast-types').builders;
var naming = require('../src/transforms/naming').naming;
var cps = require('../src/transforms/cps').cps;
var store = require('../src/transforms/store').store;
var optimize = require('../src/transforms/optimize').optimize;

function compile(code, verbose) {
  if (verbose && console.time) {
    console.time('compile');
  }

  var headAst = esprima.parse(readFile(__dirname + '/../src/header.wppl')).body;
  var codeAst = esprima.parse(code).body;

  var ast = build.program(headAst.concat(codeAst));

  ast = thunkify(ast);
  ast = naming(ast);
  ast = cps(ast, build.identifier('topK'));
  ast = optimize(ast);

  if (verbose && console.timeEnd) {
    console.timeEnd('compile');
  }

  return ast;
}

var tests = {
  constant: {
    program: '3 + 4'
  },
  call: {
    program: 'flip(0.5)'
  },
  recursion: {
    program: [
      'var geom = function() {',
      '    return flip(0.5) ? 0 : 1 + geom();',
      '}',
      'geom();'].join('\n')
  }
};

function makeTest(p) {
  return function(test) {
    test.done();
  };
}

exports.test = (function(tests) {
  var testfs = {};

  for (var test in tests) {
    if (tests.hasOwnProperty(test)) {
      testfs[test] = makeTest(tests[test].program);
    }
  }

  return testfs;
})(tests);
