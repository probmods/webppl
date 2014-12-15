'use strict';

var assert = require('assert');
var estraverse = require('estraverse');
var types = require('ast-types');
var escodegen = require('escodegen');
var esprima = require('esprima');

var build = types.builders;
var Syntax = estraverse.Syntax;


function trampoline(node) {

  if (node.seenByTrampolining){
    return node;
  }
  node.seenByTrampolining = true;

  switch (node.type) {

  // re-direct all non-primitive calls through trampoline
  // this is only okay in cps where no implicit stack is used!
  case Syntax.CallExpression:
    if (types.namedTypes.MemberExpression.check(node.callee)){
      return node;
    } else {
      var newNode = esprima.parse('_trampoline = function(){};').body[0].expression;
      newNode.right.body.body = [build.expressionStatement(node)];
      return newNode;
    }

  default:
    return node;

  }
}


function trampolineMain(node, cont, noWrapping) {

  assert(types.namedTypes.Identifier.check(cont));

  node = estraverse.replace(node, {leave: function(n){return trampoline(n);}});

  if (noWrapping){
    // used for trampolining header which only contains
    // function definitions, and to avoid duplication
    // of header/footer
    return node;
  }

  var program = esprima.parse(
    'var _main = function(){' +
    'while (_trampoline !== null){ _trampoline(); }' +
    '};' +
    '_main();');

  program.body = node.body.concat(program.body);

  return program;
}


module.exports = {
  trampoline: trampolineMain
};
