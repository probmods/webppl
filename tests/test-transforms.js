'use strict';

var webppl = require('../src/main');

var _ = require('underscore');
var parse = require('esprima').parse;
var unparse = require('escodegen').generate;
var thunkify = require('../src/syntax').thunkify;
var fail = require('../src/syntax').fail;
var naming = require('../src/transforms/naming').naming;
var cps = require('../src/transforms/cps').cps;
var store = require('../src/transforms/store').store;
var optimize = require('../src/transforms/optimize').optimize;
var trampoline = require('../src/transforms/trampoline').trampoline;
var varargs = require('../src/transforms/varargs').varargs;
var freevars = require('../src/transforms/freevars').freevars;
var util = require('../src/util');

var fooObj = {
  bar: 1,
  baz: {
    blubb: 2,
    bla: 3
  }
};

var plus, minus, times, and, plusTwo;

function compose() {
  var fs = Array.prototype.concat.apply([], arguments);

  return function(x) {
    return fs.reduceRight(function(x, f) {
      return f(x);
    }, x);
  };
}

function runTest(test, code, expected, transformAst, run) {
  var newCode = unparse(transformAst(parse(code)));

  try {
    run(test, code, newCode, expected);
  }
  catch (e) {
    console.log('Exception:', e);
    console.log(newCode);
    test.ok(false);
    test.done();
  }
}

function check(test, code, newCode, expected, actual) {
  var success = _.isEqual(expected, actual);

  test.ok(success);

  if (!success) {
    console.log(code);
    console.log(newCode);
    console.log('Expected:', expected);
    console.log('Actual:', actual);
  }

  test.done();
}

var transformAstNaming = compose(naming, function(node) {
  return thunkify(node, fail('transform', node));
});
function runNaming(test, code, newCode, expected) {
  check(test, code, newCode, expected, eval(newCode)(''));
}

var transformAstCps = compose(cps, varargs, transformAstNaming);
function runCps(test, code, newCode, expected) {
  eval(newCode)(function(actual) {
    check(test, code, newCode, expected, actual);
  }, '');
}

var transformAstStorepassing = compose(store, transformAstCps);
function runStorepassing(test, code, newCode, expected) {
  var f = eval(newCode);
  f({}, function(store, actual) {
    check(test, code, newCode, expected, actual);
  }, '');
}

var transformAstOptimize = compose(optimize, transformAstStorepassing);
var runOptimize = runStorepassing;

var transformAstVarargs = transformAstStorepassing;
var runVarargs = runStorepassing;

var transformAstTrampoline = compose(trampoline, transformAstOptimize);

function runTrampoline(test, code, newCode, expected) {
  var f = eval(newCode);
  // the result of trampoline transform needs to be evaluated an extra time,
  // supplying the runner as an argument
  f = f(util.trampolineRunners.cli);
  f({}, function(store, actual) {
    check(test, code, newCode, expected, actual);
  }, '');
}

var transformAstFreevars = compose(freevars, function(node) {
  // By thunkifying we ensure that freevars is exercised (by
  // identifying the free variables of the thunk) even when the test
  // code doesn't contain any functions.
  return thunkify(node, fail('transform', node));
});
function runFreevars(test, code, newCode, expected) {
  check(test, code, newCode, expected, eval(newCode)());
}

var selectFreevarsPrimitives = function() {
  // Set global definitions
  plus = function(x, y) {
    return (x + y);
  };
  minus = function(x, y) {
    return (x - y);
  };
  times = function(x, y) {
    return (x * y);
  };
  and = function(x, y) {
    return (x && y);
  };
  plusTwo = function(x, y) {
    return (x + 2);
  };
};

var selectNamingPrimitives = function() {
  // Set global definitions
  plus = function(a, x, y) {
    return (x + y);
  };
  minus = function(a, x, y) {
    return (x - y);
  };
  times = function(a, x, y) {
    return (x * y);
  };
  and = function(a, x, y) {
    return (x && y);
  };
  plusTwo = function(a, x, y) {
    return (x + 2);
  };
};

function selectCpsPrimitives() {
  // Set global definitions
  plus = function(k, a, x, y) {
    return k(x + y);
  };
  minus = function(k, a, x, y) {
    return k(x - y);
  };
  times = function(k, a, x, y) {
    return k(x * y);
  };
  and = function(k, a, x, y) {
    return k(x && y);
  };
  plusTwo = function(k, a, x, y) {
    return k(x + 2);
  };
}

function selectStorePrimitives() {
  // Set global definitions
  plus = function(s, k, a, x, y) {
    return k(s, x + y);
  };
  minus = function(s, k, a, x, y) {
    return k(s, x - y);
  };
  times = function(s, k, a, x, y) {
    return k(s, x * y);
  };
  and = function(s, k, a, x, y) {
    return k(s, x && y);
  };
  plusTwo = function(s, k, a, x, y) {
    return k(s, x + 2);
  };
}

var selectOptimizePrimitives = selectStorePrimitives;
var selectVarargsPrimitives = selectOptimizePrimitives;
var selectTrampolinePrimitives = selectVarargsPrimitives;

function runNamingTest(test, code, expected) {
  selectNamingPrimitives();
  return runTest(test, code, expected, transformAstNaming, runNaming);
}

function runCpsTest(test, code, expected) {
  selectCpsPrimitives();
  return runTest(test, code, expected, transformAstCps, runCps);
}

function runStorepassingTest(test, code, expected) {
  selectStorePrimitives();
  return runTest(test, code, expected, transformAstStorepassing, runStorepassing);
}

function runOptimizeTest(test, code, expected) {
  selectOptimizePrimitives();
  return runTest(test, code, expected, transformAstOptimize, runOptimize);
}

function runVarargsTest(test, code, expected) {
  selectVarargsPrimitives();
  return runTest(test, code, expected, transformAstVarargs, runVarargs);
}

function runTrampolineTest(test, code, expected) {
  selectTrampolinePrimitives();
  return runTest(test, code, expected, transformAstTrampoline, runTrampoline);
}

function runFreevarsTest(test, code, expected) {
  selectFreevarsPrimitives();
  return runTest(test, code, expected, transformAstFreevars, runFreevars);
}

function generateTestFunctions(allTests, testRunner) {
  var exports = {};
  for (var testClassName in allTests) {
    if (allTests.hasOwnProperty(testClassName)) {
      var tests = allTests[testClassName];
      exports[testClassName] = {};
      tests.forEach(
          function(obj) {
            exports[testClassName][obj.name] = function(test) {
              if (!obj.runners || _.contains(obj.runners, testRunner)) {
                return testRunner(test, obj.code, obj.expected);
              } else {
                test.done();
              }
            };
          });
    }
  }
  return exports;
}


var tests = {

  testFunctionExpression: [

    { name: 'testFunc1',
      code: 'var f = function(x){return plus(x, 10)}; f(3)',
      expected: 13 },

    { name: 'testRecursion',
      code: 'var f = function(x, n){return n==0 ? x : f(plusTwo(x), n-1);}; f(3, 4)',
      expected: 11 },

    { name: 'testDefinitionOnly1',
      code: 'var bar = function(){ var foo = function(){ return 3;} }; 5;',
      expected: 5 },

    { name: 'testDefinitionOnly2',
      code: 'var bar = function(){ var foo = function(){ return 3;}; var foo2 = function(){ return 4;} }; 5;',
      expected: 5 },

    { name: 'testReturn1',
      code: 'var foo = function(){ return 1; return 2; }; foo()',
      expected: 1 },

    { name: 'testReturn2',
      code: 'var foo = function(){ (function(){ return 1})(); return 2; }; foo()',
      expected: 2 },

    { name: 'testReturnWithoutArgFinal',
      code: 'var foo = function(){ return; }; foo()',
      expected: undefined },

    { name: 'testReturnWithoutArgInner',
      code: 'var foo = function(){ return; return 1; }; foo()',
      expected: undefined }

  ],

  testCallExpression: [

    { name: 'testPrimitive',
      code: 'plusTwo(3)',
      expected: 5 },

    { name: 'testCompound1',
      code: '(function(y){return plusTwo(y)})(123)',
      expected: 125 },

    { name: 'testCompound2',
      code: '(function(y){return y})(plusTwo(123))',
      expected: 125 },

    { name: 'testHigherOrder1',
      code: ['var foo = function(func1, func2) {',
             '  return function(x) {',
             '    return func1(x)(func2(x))',
             '  }',
             '};',
             'var f1 = function(y){return function(x){return x * y;}};',
             'var f2 = function(x){return x + 1;}',
             'foo(f1, f2)(3)'].join('\n'),
      expected: 12 },

    { name: 'testBinaryFuncPlus',
      code: 'plus(3, 5)',
      expected: 8 },

    { name: 'testBinaryFuncMinus',
      code: 'minus(3, 5)',
      expected: -2 },

    { name: 'testBinaryFuncAnd',
      code: 'and(true, false)',
      expected: false }

  ],

  testLiterals: [

    { name: 'testNumber',
      code: '456',
      expected: 456
    },

    { name: 'testString',
      code: "'foobar'",
      expected: 'foobar'
    },

    { name: 'testBool1',
      code: 'true',
      expected: true
    },

    { name: 'testBool2',
      code: 'false',
      expected: false
    }

  ],

  testEmptyStatement: [

    { name: 'testEmptyAlone',
      code: ';',
      expected: undefined },

    { name: 'testEmptyInBlock',
      code: 'plusTwo(3); ; plusTwo(5);',
      expected: 7 }

  ],

  testDebuggerStatement: [

    { name: 'test',
      code: 'debugger; true;',
      expected: true }

  ],

  testBlockStatement: [

    { name: 'testProgram',
      code: 'plusTwo(3); plusTwo(4); plusTwo(5);',
      expected: 7 },

    { name: 'testBlock1',
      code: '{ plusTwo(3) }; plusTwo(5);',
      expected: 7 },

    { name: 'testBlock2',
      code: 'plusTwo(1); { plusTwo(3) }; plusTwo(5);',
      expected: 7 },

    { name: 'testBlock3',
      code: 'plusTwo(1); { plusTwo(3); plusTwo(4); }; plusTwo(5);',
      expected: 7 },

    { name: 'testBlock4',
      code: 'plusTwo(1); { plusTwo(3); plusTwo(4); }',
      expected: 6 },

    { name: 'testBlock5',
      code: ('var identity = function(x){return x};' +
             "var obj1 = identity({ 'X': 10, 'Y': 20 });" +
             'var foo = function(){ return baz(); };' +  // forward-recursive
             "var baz = function(){ return obj1['X']; };" +
             'foo();'),
      expected: 10,
      runners: [runOptimizeTest, runTrampolineTest] }

  ],

  testVariableDeclaration: [

    { name: 'testVar1',
      code: 'var x = 1; x',
      expected: 1 },

    { name: 'testVar2',
      code: 'var x = plus(1, 2); var y = times(x, 4); y',
      expected: 12 }

  ],

  testConditionalExpression: [

    { name: 'testConditional1',
      code: 'false ? 1 : 2',
      expected: 2 },

    { name: 'testConditional2',
      code: 'true ? 1 : 2',
      expected: 1 },

    { name: 'testConditional3',
      code: 'and(true, false) ? 2 : 3',
      expected: 3 },

    { name: 'testConditional4',
      code: [
        'var id = function(x){return x};',
        'var x = undefined;',
        'var a = ((x === undefined) ? false : id(x.foo)) || true;',
        'a'
      ].join('\n'),
      expected: true }

  ],

  testIfExpression: [

    { name: 'testIf1',
      code: 'var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(3)',
      expected: 1 },

    { name: 'testIf2',
      code: 'var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(1)',
      expected: 2 },

    { name: 'testIf3',
      code: 'var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(foo(5))',
      expected: 2 },

    { name: 'testIfWithoutElse1',
      code: 'var foo = function(x){if (x > 2) { return 1 }}; foo(5)',
      expected: 1 },

    { name: 'testIfWithoutElse2',
      code: 'var foo = function(x){if (x > 2) { return 1 }}; foo(0)',
      expected: undefined },

    { name: 'testIfWithoutElse3',
      code: 'var f = function(){ if (1 < 2) { var x = 1; var y = 2; return x + y; }}; f();',
      expected: 3 },

    { name: 'testIfWithoutElse4',
      code: 'var f = function(){ if (1 < 0) { return 1; }; return 5; }; f();',
      expected: 5 },

    { name: 'testIfWithoutElse5',
      code: 'var f = function(){ if (false) { "bad"; }; }; f();',
      expected: undefined },

    { name: 'testNestedIf',
      code: 'if (1 > 2) { 3 } else { if (4 < 5) { 6 } else { 7 }}',
      expected: 6 },

    { name: 'testNestedIf2',
      code: 'var f = function(){ if (true) { "bad"; }; return "good"; }; f();',
      expected: 'good' },

    { name: 'testIfWithReturn',
      code: 'var foo = function(){ if (true) { return 3 } return 4 }; foo()',
      expected: 3 },

    { name: 'testIfInNestedFunction',
      code: ('var foo = function(x){' +
             '  var bar = function(y){' +
             '    if (y == 10) {' +
             '      return 3;' +
             '    } else {' +
             '      return 4;' +
             '    }' +
             '  };' +
             '  var z = bar(x);' +
             '  if (z === 3){' +
             '    return 1;' +
             '  } else {' +
             '    return 2;' +
             '  };' +
             '};' +
             'foo(10);'),
      expected: 1 }

  ],

  testArrayExpression: [

    { name: 'testArray1',
      code: '[1, 2, 3]',
      expected: [1, 2, 3] },

    { name: 'testArray2',
      code: '[plusTwo(1), plus(2, 5), 3]',
      expected: [3, 7, 3] }

  ],

  testObjectExpression: [

    { name: 'testObjectAtomic',
      code: 'var x = {a: 1, b: 2}; x',
      expected: {a: 1, b: 2} },

    { name: 'testObjectCompound',
      code: 'var x = {a: 1+2, b: [4,5]}; x',
      expected: {a: 3, b: [4, 5]} },

    { name: 'testNestedObject',
      code: ['var box = {',
        '  sub: {',
        '    f: function(x1){',
        '      return function(x2){',
        '        return x1 + x2;',
        '      }',
        '    }',
        '  }',
        '}',
        '',
        'var g = box.sub.f;',
        'g(1)(2)'].join('\n'),
      expected: 3 }

  ],

  testMemberExpression: [

    { name: 'testMember1',
      code: 'fooObj.bar',
      expected: 1 },

    { name: 'testMember2',
      code: 'fooObj.baz.blubb',
      expected: 2 },

    { name: 'testMember3',
      code: 'var a = [1,2]; a[1]',
      expected: 2 },

    { name: 'testMember4',
      code: '(function() { return fooObj; })().bar',
      expected: 1 }

  ],

  testNAryExpression: [

    { name: 'testPlus',
      code: '3 + 4',
      expected: 7 },

    { name: 'testUnary',
      code: '-5',
      expected: -5 },

    { name: 'testCompound1',
      code: '(-3 + (4 * 5)) - 10',
      expected: 7 },

    { name: 'testCompound2',
      code: 'var f = function(x){return 2*x + 4;}; (-3 + f(4 * 5)) - f(10)',
      expected: 17 }

  ],

  testLogicalExpression: [

    { name: 'testLogicalOr',
      code: 'true || false',
      expected: true },

    { name: 'testLogicalNot',
      code: '!(true || true)',
      expected: false },

    { name: 'testLogicalAnd',
      code: 'true && false',
      expected: false },

    { name: 'testLogicalCompound1',
      code: 'true && (false || false || true)',
      expected: true },

    { name: 'testLogicalCompound2',
      code: '!(true && (false || false || true))',
      expected: false },

    { name: 'testLazyLogical',
      code: [
        'var id = function(x){return x};',
        'var x = undefined;',
        'var a = true || id(x.foo);',
        'a'
      ].join('\n'),
      expected: true }

  ],

  testPrimitiveWrapping: [

    { name: 'testMath',
      code: 'Math.log(Math.exp(5))',
      expected: 5 },

    { name: 'testCompound',
      code: 'var f = function(x){return Math.log(x);}; Math.exp(f(17))',
      expected: 17 },

    { name: 'testMemberFromFn',
      code: 'var foo = function() {return [1]}; foo().concat([2])',
      expected: [1, 2] }

  ],

  testVarargs: [

    { name: 'testVarargs1',
      code: ('var foo = function(){return arguments[0] + arguments[1]};' +
             'foo(3, 4);'),
      expected: 7,
      runners: [runVarargsTest, runTrampolineTest] },

    { name: 'testVarargs2',
      code: ('var bar = function(){return arguments[0]*2};' +
             'var foo = function(){return bar(arguments[0] + arguments[1]);};' +
             'foo(3, 4);'),
      expected: 14,
      runners: [runVarargsTest, runTrampolineTest] },

    { name: 'testVarargs3',
      code: ('var foo = function(x, y){var f = function(){ return arguments[0]}; return f(y)};' +
             'foo(3, 4);'),
      expected: 4,
      runners: [runVarargsTest, runTrampolineTest] },
    { name: 'testVarargs4',
      code: ('var bar = function(){return function(xs){return xs;}};;' +
             'var foo = function(){return bar()(arguments)};' +
             'foo(3, 4);'),
      expected: [3, 4],
      runners: [runVarargsTest, runTrampolineTest] },
    { name: 'testApply',
      code: ('var foo = function(x, y){return x + y};' +
             'var bar = function(){ return apply(foo, arguments); };' +
             'bar(3, 4);'),
      expected: 7,
      runners: [runVarargsTest, runTrampolineTest] }

  ]

};

exports.testNaming = generateTestFunctions(tests, runNamingTest);
exports.testCps = generateTestFunctions(tests, runCpsTest);
exports.testStorepassing = generateTestFunctions(tests, runStorepassingTest);
exports.testOptimize = generateTestFunctions(tests, runOptimizeTest);
exports.testTrampoline = generateTestFunctions(tests, runTrampolineTest);
exports.testVarargs = generateTestFunctions(tests, runVarargsTest);
exports.testTrampoline = generateTestFunctions(tests, runTrampolineTest);
exports.testFreevars = generateTestFunctions(tests, runFreevarsTest);
