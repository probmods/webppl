'use strict';

var _ = require('underscore');
var path = require('path');
var webppl = require('../src/main');
var errors = require('../src/errors/errors');
var parseV8 = require('../src/errors/parsers').parseV8;

var testDefs = [
  { name: 'top-level',
    code: 'null[0]',
    stack: [{line: 1, col: 0, name: null}],
    debug: true
  },
  { name: 'top-level',
    code: 'null[0]',
    stack: [{line: 1, col: 0, name: null}],
    debug: false
  },

  { name: 'depth 1',
    code: 'var f = function() { null[0]; };\nf();',
    stack: [
      {line: 1, col: 21, name: null},
      {line: 2, col: 0, name: 'f'}],
    debug: true
  },
  { name: 'depth 1',
    code: 'var f = function() { null[0]; };\nf();',
    stack: [{line: 1, col: 21, name: null}],
    debug: false
  },

  { name: 'depth 2',
    code: 'var g = function() { a; };\nvar f = function() { g(); };\nf();',
    stack: [
      {line: 1, col: 21, name: 'a'},
      {line: 2, col: 21, name: 'g'},
      {line: 3, col: 0, name: 'f'}],
    debug: true
  },

  { name: 'header',
    code: 'first(null);',
    stack: [
      {file: 'header.wppl', name: null},
      {line: 1, col: 0, file: 'webppl:program', name: 'first'}],
    debug: true
  },
  { name: 'header',
    code: 'first(null);',
    stack: [
      {file: 'header.wppl', name: null}],
    debug: false
  },

  { name: 'JS',
    code: 'util.fatal(util.jsnew(Error))',
    stack: [
      {file: RegExp(path.join('src', 'util.js') + '$'), webppl: false, name: null},
      {line: 1, col: 16, file: 'webppl:program', name: 'jsnew'}],
    debug: true
  },
  { name: 'JS',
    code: 'util.fatal(util.jsnew(Error))',
    stack: [
      {file: RegExp(path.join('src', 'util.js') + '$'), webppl: false, name: null},
      {line: 1, col: 16, file: 'webppl:program', name: 'jsnew'}],
    debug: false
  },

  { name: 'native',
    code: ['var f = function() {',
           '  var a = {};',
           '  var b = {a: a};',
           '  _.assign(a, {b: b});',
           '  JSON.stringify(a);',
           '};',
           'f();'].join('\n'),
    stack: [
      {line: null, col: null, native: true, name: null},
      {line: 5, col: 7, webppl: true, name: 'stringify'},
      {line: 7, col: 0, webppl: true, name: 'f'}],
    debug: true
  },
  { name: 'native',
    code: ['var f = function() {',
           '  var a = {};',
           '  var b = {a: a};',
           '  _.assign(a, {b: b});',
           '  JSON.stringify(a);',
           '};',
           'f();'].join('\n'),
    stack: [
      {line: null, col: null, native: true, name: null},
      {line: 5, col: 7, webppl: true, name: 'stringify'}],
    debug: false
  },

  { name: 'call site not in address map',
    code: ['mapData({data: [0]}, function(x) {',
           '  null[0];',
           '})'].join('\n'),
    stack: [{line: 2, col: 2, name: null}],
    debug: true
  },

  // The idea here is to test that the stack is as expected at the
  // error which occurs after we continue from the sample statement
  // for the second time.

  // For this to work as expected, the current address must be saved
  // after invoking the continuation and before the error.
  { name: 'after continuation',
    code: ['var d = Bernoulli({p: .5});',
           'var g = function() {',
           '  var x = sample(d);',
           '  assert.ok(x === false);',
           '  return x;',
           '};',
           'var f = function() {',
           '  return g();',
           '};',
           'Enumerate(function() {',
           '  return f();',
           '});'].join('\n'),
    stack: [{line: 4, col: 9, name: 'ok'},
            {line: 8, col: 9, name: 'g'},
            {line: 11, col: 9, name: 'f'},
            {line: 10, col: 0, name: 'Enumerate'}],
    debug: true
  }
];

function testEntry(entry, props, test) {
  if (_.has(props, 'line')) {
    test.strictEqual(entry.lineNumber, props.line, 'Unexpected line number.');
  }
  if (_.has(props, 'col')) {
    test.strictEqual(entry.columnNumber, props.col, 'Unexpected column number.');
  }
  if (_.has(props, 'name')) {
    test.strictEqual(entry.name, props.name, 'Unexpected name.');
  }
  if (_.has(props, 'webppl')) {
    test.strictEqual(entry.webppl, props.webppl);
  }
  if (_.has(props, 'file')) {
    if (props.file instanceof RegExp) {
      test.ok(entry.fileName.match(props.file));
    } else {
      test.strictEqual(entry.fileName, props.file, 'Unexpected file name.');
    }
  }
}

function getStack(code, debug) {
  var stack;
  try {
    webppl.run(code, null, {debug: debug});
  } catch (e) {
    stack = errors.recoverStack(e, parseV8);
  }
  return stack;
}

function runTest(def, test) {
  var stack = getStack(def.code, def.debug);
  var expectedStack = def.stack;
  //console.log(JSON.stringify(stack));
  //console.log(JSON.stringify(expectedStack));

  if (stack.length < expectedStack.length) {
    test.ok(false, 'Stack is smaller than expected.');
    test.done();
    return;
  }

  _.each(expectedStack, function(expectedEntry, i) {
    testEntry(stack[i], expectedEntry, test);
  });

  test.done();
}

function generateTests() {
  _.each(testDefs, function(def, i) {
    var k = def.debug ? 'debug' : 'noDebug';
    if (!exports[k]) {
      exports[k] = {};
    }
    exports[k][def.name] = function(test) {
      runTest(def, test);
    };
  });
}

generateTests();
