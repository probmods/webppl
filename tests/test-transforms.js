"use strict";

var _ = require('underscore');
var esprima = require("esprima");
var escodegen = require("escodegen");
var types = require("ast-types");
var cps = require("../src/cps.js");
var util = require("../src/util.js");
var store = require("../src/store").store;
var naming = require("../src/naming.js").naming;
var optimize = require("../src/optimize.js").optimize;

var build = types.builders;

var fooObj = {
  bar: 1,
  baz: {
    blubb: 2,
    bla: 3
  }
};

var plus, minus, times, and, plusTwo;

var runTest = function(test, code, expected, transformAst){
  var actual = "unset";
  var ast = esprima.parse(code);
  var newAst = transformAst(ast);
  var newCode = escodegen.generate(newAst);
  try {
    eval(newCode);
  } catch (e) {
    console.log('Exception:', e);
    console.log(newCode);
  }
  var testPassed = _.isEqual(actual, expected);
  test.ok(testPassed);
  if (!testPassed){
    console.log(newCode);
    console.log("Expected:", expected);
    console.log("Actual:", actual);
  }
  test.done();
};

var transformAstCps = function(ast){
  var newAst = cps.cps(ast, build.identifier("topK"));
  var topKAst = esprima.parse("var topK = function(x){ actual = x; };");
  newAst.body = topKAst.body.concat(newAst.body);
  return newAst;
};

var transformAstStorepassing = function(ast){
  var cpsAst = cps.cps(ast, build.identifier("topK"));
  var storeAst = store(cpsAst);
  var globalStoreAst = esprima.parse("var globalStore = {};");
  var topKAst = esprima.parse("var topK = function(globalStore, x){ actual = x; };");
  storeAst.body = globalStoreAst.body.concat(storeAst.body);
  storeAst.body = topKAst.body.concat(storeAst.body);
  return storeAst;
};

var transformAstNaming = function(ast){
  var namedAst = naming(ast);
  return transformAstStorepassing(namedAst);
};

var transformAstOptimize = function(ast){
  var newAst = transformAstNaming(ast);
  return optimize(newAst);
};

var runCpsTest = function(test, code, expected){
  // Set global definitions
  plus = function(k, x, y) {return k(x + y);};
  minus = function(k, x, y) {return k(x - y);};
  times = function(k, x, y) {return k(x * y);};
  and = function(k, x, y) {return k(x && y);};
  plusTwo = function(k, x, y) {return k(x + 2);};
  return runTest(test, code, expected, transformAstCps);
};

var runStorepassingTest = function(test, code, expected){
  // Set global definitions
  plus = function(s, k, x, y) {return k(s, x + y);};
  minus = function(s, k, x, y) {return k(s, x - y);};
  times = function(s, k, x, y) {return k(s, x * y);};
  and = function(s, k, x, y) {return k(s, x && y);};
  plusTwo = function(s, k, x, y) {return k(s, x + 2);};
  return runTest(test, code, expected, transformAstStorepassing);
};

var runNamingTest = function(test, code, expected){
  // Set global definitions
  plus = function(s, k, a, x, y) {return k(s, x + y);};
  minus = function(s, k, a, x, y) {return k(s, x - y);};
  times = function(s, k, a, x, y) {return k(s, x * y);};
  and = function(s, k, a, x, y) {return k(s, x && y);};
  plusTwo = function(s, k, a, x, y) {return k(s, x + 2);};
  return runTest(test, code, expected, transformAstNaming);
};

var runOptimizationTest = function(test, code, expected){
  // Set global definitions
  plus = function(s, k, a, x, y) {return k(s, x + y);};
  minus = function(s, k, a, x, y) {return k(s, x - y);};
  times = function(s, k, a, x, y) {return k(s, x * y);};
  and = function(s, k, a, x, y) {return k(s, x && y);};
  plusTwo = function(s, k, a, x, y) {return k(s, x + 2);};
  return runTest(test, code, expected, transformAstOptimize);
};


var generateTestFunctions = function(allTests, testRunner){
  var exports = {};
  for (var testClassName in allTests){
    var tests = allTests[testClassName];
    exports[testClassName] = {};
    tests.forEach(
      function(obj){
        exports[testClassName][obj.name] = function(test){
          return testRunner(test, obj.code, obj.expected);
        };
      });
  };
  return exports;
};


var tests = {

  testFunctionExpression:  [

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
      expected: 2 }

  ],

  testCallExpressionTests : [

    { name: 'testPrimitive',
      code: 'plusTwo(3)',
      expected: 5 },

    { name: 'testCompound1',
      code: '(function(y){return plusTwo(y)})(123)',
      expected: 125 },

    { name: 'testCompound2',
      code: '(function(y){return y})(plusTwo(123))',
      expected: 125 },

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
      code: ";",
      expected: undefined },

    { name: 'testEmptyInBlock',
      code: "plusTwo(3); ; plusTwo(5);",
      expected: 7 }

  ],

  testBlockStatement: [

    { name: 'testProgram',
      code: "plusTwo(3); plusTwo(4); plusTwo(5);",
      expected: 7 },

    { name: 'testBlock1',
      code: "{ plusTwo(3) }; plusTwo(5);",
      expected: 7 },

    { name: 'testBlock2',
      code: "plusTwo(1); { plusTwo(3) }; plusTwo(5);",
      expected: 7 },

    { name: 'testBlock3',
      code: "plusTwo(1); { plusTwo(3); plusTwo(4); }; plusTwo(5);",
      expected: 7 },

    { name: 'testBlock4',
      code: "plusTwo(1); { plusTwo(3); plusTwo(4); }",
      expected: 6 }

  ],

  testVariableDeclaration: [

    { name: 'testVar1',
      code: "var x = 1; x",
      expected: 1 },

    { name: 'testVar2',
      code: "var x = plus(1, 2); var y = times(x, 4); y",
      expected: 12 }

  ],

  testConditionalExpression: [

    { name: 'testConditional1',
      code: "false ? 1 : 2",
      expected: 2 },

    { name: 'testConditional2',
      code: "true ? 1 : 2",
      expected: 1 },

    { name: 'testConditional3',
      code: "and(true, false) ? 2 : 3",
      expected: 3 }

  ],

  testIfExpression: [

    { name: 'testIf1',
      code: "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(3)",
      expected: 1 },

    { name: 'testIf2',
      code: "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(1)",
      expected: 2 },

    { name: 'testIf3',
      code: "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(foo(5))",
      expected: 2 },

    { name: 'testIfWithoutElse1',
      code: "var foo = function(x){if (x > 2) { return 1 }}; foo(5)",
      expected: 1 },

    { name: 'testIfWithoutElse2',
      code: "var foo = function(x){if (x > 2) { return 1 }}; foo(0)",
      expected: undefined },

    { name: 'testIfWithoutElse3',
      code: "var f = function(){ if (1 < 2) { var x = 1; var y = 2; return x + y;	}}; f();",
      expected: 3 },

    { name: 'testNestedIf',
      code: "if (1 > 2) { 3 } else { if (4 < 5) { 6 } else { 7 }}",
      expected: 6 },

    { name: 'testIfWithReturn',
      code: "var foo = function(){ if (true) { return 3 } return 4 }; foo()",
      expected: 3 },

    { name: 'testIfInNestedFunction',
      code:  ("var foo = function(x){" +
              "  var bar = function(y){" +
              "    if (y == 10) {" +
              "      return 3;" +
              "    } else {" +
              "      return 4;" +
              "    }" +
              "  };" +
              "  var z = bar(x);" +
              "  if (z === 3){" +
              "    return 1;" +
              "  } else {" +
              "    return 2;" +
              "  };" +
              "};" +
              "foo(10);"),
      expected: 1 }

  ],

  testArrayExpressionTests: [

    { name: 'testArray1',
      code: "[1, 2, 3]",
      expected: [1, 2, 3] },

    { name: 'testArray2',
      code: "[plusTwo(1), plus(2, 5), 3]",
      expected: [3, 7, 3] }

  ],

  testMemberExpression: [

    { name: 'testMember1',
      code: "fooObj.bar",
      expected: 1 },

    { name: 'testMember2',
      code: "fooObj.baz.blubb",
      expected: 2 },

    { name: 'testMember3',
      code: "var a = [1,2]; a[1]",
      expected: 2 }

  ],

  testNAryExpressionTests: [

    { name: 'testPlus',
      code: "3 + 4",
      expected: 7 },

    { name: 'testUnary',
      code: "-5",
      expected: -5 },

    { name: 'testCompound1',
      code: "(-3 + (4 * 5)) - 10",
      expected: 7 },

    { name: 'testCompound2',
      code: "var f = function(x){return 2*x + 4;}; (-3 + f(4 * 5)) - f(10)",
      expected: 17 }

  ],

  testPrimitiveWrapping: [

    { name: 'testMath',
      code: "Math.log(Math.exp(5))",
      expected: 5 },

    { name: 'testCompound',
      code: "var f = function(x){return Math.log(x);}; Math.exp(f(17))",
      expected: 17 },

    { name: 'testMemberFromFn',
      code: "var foo = function() {return [1]}; foo().concat([2])",
      expected: [1,2] }

  ]

};

exports.testCps = generateTestFunctions(tests, runCpsTest);
exports.testStorepassing = generateTestFunctions(tests, runStorepassingTest);
exports.testNaming = generateTestFunctions(tests, runNamingTest);
exports.testOptimization = generateTestFunctions(tests, runOptimizationTest);
