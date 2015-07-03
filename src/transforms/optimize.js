'use strict';

var esmangle = require('esmangle');
var estraverse = require('estraverse');
var types = require('ast-types');

var build = types.builders;
var Syntax = estraverse.Syntax;

var fail = require('../syntax').fail;
var inProgram = require('../syntax').inProgram;


function createPipeline() {

  var pipeline = [
    //* 'pass/hoist-variable-to-arguments',
    'pass/transform-dynamic-to-static-property-access',
    'pass/transform-dynamic-to-static-property-definition',
    'pass/transform-immediate-function-call',
    'pass/transform-logical-association',
    'pass/reordering-function-declarations',
    'pass/remove-unused-label',
    'pass/remove-empty-statement',
    'pass/remove-wasted-blocks',
    'pass/transform-to-compound-assignment',
    //*    'pass/transform-to-sequence-expression',
    'pass/transform-branch-to-expression',
    'pass/transform-typeof-undefined',
    'pass/reduce-sequence-expression',
    'pass/reduce-branch-jump',
    'pass/reduce-multiple-if-statements',
    'pass/dead-code-elimination',
    'pass/remove-side-effect-free-expressions',
    'pass/remove-context-sensitive-expressions',
    'pass/tree-based-constant-folding',
    //* 'pass/concatenate-variable-definition',
    'pass/drop-variable-definition',
    //    'pass/remove-unreachable-branch',
    'pass/eliminate-duplicate-function-declarations'
  ];

  pipeline = [pipeline.map(esmangle.pass.require)];
  pipeline.push({
    once: true,
    pass: [
      'post/transform-static-to-dynamic-property-access',
      'post/transform-infinity',
      'post/rewrite-boolean',
      'post/rewrite-conditional-expression',
      'post/omit-parens-in-void-context-iife'
    ].map(esmangle.pass.require)
  });

  return pipeline;
}


function identifiersEqual(x, y) {
  return (types.namedTypes.Identifier.check(x) &&
          types.namedTypes.Identifier.check(y) &&
          x.name === y.name);
}

function optimize(node) {

  switch (node.type) {

    case Syntax.BlockStatement:
      for (var i = 0; i < node.body.length; i++) {
        var ithNode = node.body[i];
        // remove 'var x = x' variable declarations
        if (types.namedTypes.VariableDeclaration.check(ithNode)) {
          var declaration = ithNode.declarations[0];
          if (identifiersEqual(declaration.id, declaration.init)) {
            node.body.splice(i, 1);
          }
        }
      }
      return node;

    case Syntax.ExpressionStatement:
      // turn immediate anonymous function calls into blocks
      if (types.namedTypes.CallExpression.check(node.expression) &&
          types.namedTypes.FunctionExpression.check(node.expression.callee)) {
        var funcNode = node.expression.callee;
        var appNode = node.expression;
        var stmts = [];
        // for each argument add a variable definition
        for (var i = 0; i < appNode.arguments.length; i++) {
          var stmt = build.variableDeclaration(
              'var', [build.variableDeclarator(funcNode.params[i], appNode.arguments[i])]);
          stmts.push(stmt);
        }
        // finally, add expressionstatement for func body
        stmts.push(funcNode.body);
        return build.blockStatement(stmts);
      } else {
        return node;
      }

    case Syntax.VariableDeclaration:
      // Un-wrap debugger statements.
      if (node.declarations.length === 1 &&
          node.declarations[0].id.name.slice(0, 9) === '_debugger') {
        return build.debuggerStatement();
      } else {
        return node;
      }

    default:
      return node;
  }
}

function optimizeMain(node) {
  return inProgram(function(node) {
    return esmangle.optimize(estraverse.replace(node, {
      enter: optimize,
      leave: optimize
    }), createPipeline(), {
      inStrictCode: true,
      legacy: false
    });
  })(node, fail('optimize: inBody', node));
}

module.exports = {
  optimize: optimizeMain
};
