'use strict';

var assert = require('assert');
var path = require('path');
var parse = require('esprima').parse;
var replace = require('estraverse').replace;
var generate = require('escodegen').generate;
var build = require('ast-types').builders;
var sweet = require('sweet.js');
var _ = require('underscore');
var util = require('../util');

var adMacros = sweet.loadNodeModule(null, 'adnn/ad/macros.sjs');
var sweetOptions = { modules: adMacros, readableNames: true, ast: true };

function expandMacros(code) {
  return sweet.compile(code, sweetOptions);
}

function expandMacrosInFunction(node) {
  if (node.type === 'FunctionExpression') {
    return expandMacros('(' + generate(node) + ')').body[0].expression;
  } else if (node.type === 'FunctionDeclaration') {
    return expandMacros(generate(node)).body[0];
  } else {
    throw 'Unknown type.';
  }
}

function isMarkedForGlobalTransform(ast) {
  assert.ok(ast.type === 'Program');
  var body = ast.body;
  if (!(body.length > 0 && isUseStrictExpr(body[0]))) {
    throw 'Expected program to enable strict mode.';
  }
  return body.length > 1 && isUseAdExpr(body[1]);
}

function isMarkedForTransform(node) {
  return node.body.body.length > 0 && isUseAdExpr(node.body.body[0]);
}

function isUseAdExpr(node) {
  return node.type === 'ExpressionStatement' &&
      node.expression.type === 'Literal' &&
      node.expression.value === 'use ad';
}

function isUseStrictExpr(node) {
  return node.type === 'ExpressionStatement' &&
      node.expression.type === 'Literal' &&
      node.expression.value === 'use strict';
}

function transform(ast) {
  return replace(ast, {
    enter: function(node, parent) {
      if (node.type === 'FunctionExpression' ||
          node.type === 'FunctionDeclaration') {
        if (isMarkedForTransform(node)) {
          this.skip(); // Don't traverse child nodes.
          return expandMacrosInFunction(node);
        }
      }
    }
  });
}

function addAdRequire(ast, adRequirePath) {
  var body = ast.body;
  var useStrictNode = body[0];
  assert.ok(isUseStrictExpr(useStrictNode));
  var requireNode = parse("var ad = require('" + adRequirePath + "');").body[0];
  var rest = body.slice(1);
  return build.program([useStrictNode, requireNode].concat(rest));
}

function removeUseAdExpressions(ast) {
  return replace(ast, {
    enter: function(node, parent) {
      if (isUseAdExpr(node) &&
          (parent.type === 'BlockStatement' ||
           parent.type === 'Program')) {
        this.remove();
      }
    }
  });
}

function adifyMain(code, adRequirePath) {
  return util.pipeline([
    parse,
    function(node) {
      return isMarkedForGlobalTransform(node) ?
          expandMacros(code) :
          transform(node);
    },
    _.partial(addAdRequire, _, adRequirePath),
    removeUseAdExpressions,
    generate
  ])(code);
}

module.exports = {
  adify: adifyMain
};
