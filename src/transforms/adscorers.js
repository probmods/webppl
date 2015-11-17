'use strict';

var assert = require('assert');
var _ = require('underscore');
var parse = require('esprima').parse;
var replace = require('estraverse').replace;
var generate = require('escodegen').generate;
var build = require('ast-types').builders;
var sweet = require('sweet.js');
var util = require('../util');

var adMacros = sweet.loadNodeModule(null, 'ad.js/macros');
var sweetOptions = { modules: adMacros, readableNames: true, ast: true };

function expandMacros(code) {
  return sweet.compile(code, sweetOptions).body[0];
}

function transform(ast) {
  var helpers = ['sum', 'fact', 'lnfact', 'binomialG', 'logBeta', 'logGamma'];

  var isHelperFn = function(node) {
    return node.type === 'FunctionDeclaration' &&
        _.contains(helpers, node.id.name);
  };

  var isNamedScoreFn = function(node) {
    return node.type === 'FunctionDeclaration' &&
        node.id.name.match(/Score$/);
  };

  var isAnonymousScoreFn = function(node, parent) {
    return node.type === 'FunctionExpression' &&
        parent.type === 'Property' &&
        parent.key.name === 'score';
  };

  return replace(ast, {
    enter: function(node, parent) {
      if (isAnonymousScoreFn(node, parent)) {
        return expandMacros('(' + generate(node) + ')').expression;
      }

      if (isHelperFn(node) || isNamedScoreFn(node)) {
        return expandMacros(generate(node));
      }
    }
  });
}

function addAdRequire(ast) {
  var body = ast.body;
  assert.ok(isUseStrictExpr(body[0]), 'Strict mode expected.');
  var useStrictNode = body[0];
  var requireNode = parse("var ad = require('ad.js')({ mode: 'r' });").body[0];
  var rest = body.slice(1);
  return build.program([useStrictNode, requireNode].concat(rest));
}

function isUseStrictExpr(node) {
  return node.type === 'ExpressionStatement' &&
      node.expression.type === 'Literal' &&
      node.expression.value === 'use strict';
}

function adscorersMain(code) {
  return util.pipeline([
    parse,
    transform,
    addAdRequire,
    generate
  ])(code);
}

module.exports = {
  adscorers: adscorersMain
};
