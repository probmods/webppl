"use strict";

var _ = require('underscore');
var esprima = require("esprima");
var escodegen = require("escodegen");
var types = require("ast-types");
var cps = require("../src/cps.js");
var util = require("../src/util.js");

var build = types.builders;

var fooObj = {
  bar: 1,
  baz: {
    blubb: 2,
    bla: 3
  }
};
var plus = function(k, x, y) {return k(x + y);};
var minus = function(k, x, y) {return k(x - y);};
var times = function(k, x, y) {return k(x * y);};
var and = function(k, x, y) {return k(x && y);};
var plusTwo = function(k, x, y) {return k(x + 2);};

var runCpsTest = function(test, code, expected){
  var actual = "unset";
  var ast = esprima.parse(code);
  var newAst = cps.cps(ast, build.identifier("topK"));
  var topKAst = esprima.parse("var topK = function(x){ actual = x; };");
  newAst.body = topKAst.body.concat(newAst.body);
  var newCode = escodegen.generate(newAst);
  eval(newCode);
  var testPassed = _.isEqual(actual, expected);
  test.ok(testPassed);
  if (!testPassed){
    console.log(newCode);
    console.log("Expected:", expected);
    console.log("Actual:", actual);
  }
  test.done();
};

exports.testFunctionExpression = {

  testFunc1: function (test) {
    var code = "var f = function(x){return plus(x, 10)}; f(3)";
    var expected = 13;
    return runCpsTest(test, code, expected);
  },

  testRecursion: function(test) {
    var code = "var f = function(x, n){return n==0 ? x : f(plusTwo(x), n-1);}; f(3, 4)";
    var expected = 11;
    return runCpsTest(test, code, expected);
  },

  testDefinitionOnly1: function(test){
    var code = "var bar = function(){ var foo = function(){ return 3;} }; 5;";
    var expected = 5;
    return runCpsTest(test, code, expected);
  },

  testDefinitionOnly2: function(test){
    var code = "var bar = function(){ var foo = function(){ return 3;}; var foo2 = function(){ return 4;} }; 5;";
    var expected = 5;
    return runCpsTest(test, code, expected);
  }

};

exports.testCallExpression = {

  testPrimitive: function (test) {
    var code = "plusTwo(3)";
    var expected = 5;
    return runCpsTest(test, code, expected);
  },

  testCompound1: function (test) {
    var code = "(function(y){return plusTwo(y)})(123)";
    var expected = 125;
    return runCpsTest(test, code, expected);
  },

  testCompound2: function (test) {
    var code = "(function(y){return y})(plusTwo(123))";
    var expected = 125;
    return runCpsTest(test, code, expected);
  },

  // testCompound3: function (test) {
  //     var code = "(function(y){y})(plusTwo(123))"
  //     var expected = undefined;
  //     return runCpsTest(test, code, expected);
  // },

  testBinaryFuncPlus: function (test) {
    var code = "plus(3, 5)";
    var expected = 8;
    return runCpsTest(test, code, expected);
  },

  testBinaryFuncMinus: function (test) {
    var code = "minus(3, 5)";
    var expected = -2;
    return runCpsTest(test, code, expected);
  },

  testBinaryFuncAnd: function (test) {
    var code = "and(true, false)";
    var expected = false;
    return runCpsTest(test, code, expected);
  }

};

exports.testLiteral = {

  testNumber: function (test) {
    var code = "456";
    var expected = 456;
    return runCpsTest(test, code, expected);
  },

  testString: function (test) {
    var code = "'foobar'";
    var expected = 'foobar';
    return runCpsTest(test, code, expected);
  },

  testBool1: function (test) {
    var code = "true";
    var expected = true;
    return runCpsTest(test, code, expected);
  },

  testBool2: function (test) {
    var code = "false";
    var expected = false;
    return runCpsTest(test, code, expected);
  }

};

exports.testEmptyStatement = {

  testEmptyAlone: function (test) {
    var code = ";";
    var expected = undefined;
    return runCpsTest(test, code, expected);
  },

  testEmptyInBlock: function (test) {
    var code = "plusTwo(3); ; plusTwo(5);";
    var expected = 7;
    return runCpsTest(test, code, expected);
  }

};

exports.testblockStatement = {

  testProgram: function (test) {
    var code = "plusTwo(3); plusTwo(4); plusTwo(5);";
    var expected = 7;
    return runCpsTest(test, code, expected);
  },

  testBlock1: function (test) {
    var code = "{ plusTwo(3) }; plusTwo(5);";
    var expected = 7;
    return runCpsTest(test, code, expected);
  },

  testBlock2: function (test) {
    var code = "plusTwo(1); { plusTwo(3) }; plusTwo(5);";
    var expected = 7;
    return runCpsTest(test, code, expected);
  },

  testBlock3: function (test) {
    var code = "plusTwo(1); { plusTwo(3); plusTwo(4); }; plusTwo(5);";
    var expected = 7;
    return runCpsTest(test, code, expected);
  },

  testBlock4: function (test) {
    var code = "plusTwo(1); { plusTwo(3); plusTwo(4); }";
    var expected = 6;
    return runCpsTest(test, code, expected);
  }

};

exports.testVariableDeclaration = {

  testVar1: function (test) {
    var code = "var x = 1; x";
    var expected = 1;
    return runCpsTest(test, code, expected);
  },

  testVar2: function (test) {
    var code = "var x = plus(1, 2); var y = times(x, 4); y";
    var expected = 12;
    return runCpsTest(test, code, expected);
  }
};

exports.testConditionalExpression = {

  testConditional1: function (test) {
    var code = "false ? 1 : 2";
    var expected = 2;
    return runCpsTest(test, code, expected);
  },

  testConditional2: function (test) {
    var code = "true ? 1 : 2";
    var expected = 1;
    return runCpsTest(test, code, expected);
  },

  testConditional3: function (test) {
    var code = "and(true, false) ? 2 : 3";
    var expected = 3;
    return runCpsTest(test, code, expected);
  }

};

exports.testIfExpression = {

  testIf1: function(test) {
    var code = "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(3)";
    var expected = 1;
    return runCpsTest(test, code, expected);
  },

  testIf2: function(test) {
    var code = "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(1)";
    var expected = 2;
    return runCpsTest(test, code, expected);
  },

  testIf3: function(test) {
    var code = "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(foo(5))";
    var expected = 2;
    return runCpsTest(test, code, expected);
  },

  testIfWithoutElse1: function(test) {
    var code = "var foo = function(x){if (x > 2) { return 1 }}; foo(5)";
    var expected = 1;
    return runCpsTest(test, code, expected);
  },

  testIfWithoutElse2: function(test) {
    var code = "var foo = function(x){if (x > 2) { return 1 }}; foo(0)";
    var expected = undefined;
    return runCpsTest(test, code, expected);
  },

  testIfWithoutElse3: function(test) {
    var code = "var f = function(){ if (1 < 2) { var x = 1; var y = 2; return x + y;	}}; f();";
    var expected = 3;
    return runCpsTest(test, code, expected);
  },

  testNestedIf: function(test) {
    var code = "if (1 > 2) { 3 } else { if (4 < 5) { 6 } else { 7 }}";
    var expected = 6;
    return runCpsTest(test, code, expected);
  }

};

exports.testArrayExpression = {

  testArray1: function (test) {
    var code = "[1, 2, 3]";
    var expected = [1, 2, 3];
    return runCpsTest(test, code, expected);
  },

  testArray2: function (test) {
    var code = "[plusTwo(1), plus(2, 5), 3]";
    var expected = [3, 7, 3];
    return runCpsTest(test, code, expected);
  }

};

exports.testMemberExpression = {

  testMember1: function (test) {
    var code = "fooObj.bar";
    var expected = 1;
    return runCpsTest(test, code, expected);
  },

  testMember2: function (test) {
    var code = "fooObj.baz.blubb";
    var expected = 2;
    return runCpsTest(test, code, expected);
  },

testMember3: function (test) {
    var code = "var a = [1,2]; a[1]";
    var expected = 2;
    return runCpsTest(test, code, expected);
}

};

exports.testNAryExpression = {

  testPlus: function (test) {
    var code = "3 + 4";
    var expected = 7;
    return runCpsTest(test, code, expected);
  },

  testUnary: function(test) {
    var code = "-5";
    var expected = -5;
    return runCpsTest(test, code, expected);
  },

  testCompound1: function (test) {
    var code = "(-3 + (4 * 5)) - 10";
    var expected = 7;
    return runCpsTest(test, code, expected);
  },

  testCompound2: function (test) {
    var code = "var f = function(x){return 2*x + 4;}; (-3 + f(4 * 5)) - f(10)";
    var expected = 17;
    return runCpsTest(test, code, expected);
  }

};

exports.testPrimitiveWrapping = {

  testMath: function(test){
    var code = "Math.log(Math.exp(5))";
    var expected = 5;
    return runCpsTest(test, code, expected);
  },

  testCompound: function (test) {
    var code = "var f = function(x){return Math.log(x);}; Math.exp(f(17))";
    var expected = 17;
    return runCpsTest(test, code, expected);
  }

};