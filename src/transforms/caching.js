'use strict';

var _ = require('underscore');

var estraverse = require('estraverse');
var build = require('ast-types').builders;
var types = require('ast-types').types;
var isPrimitive = require('../syntax').isPrimitive;

var Syntax = estraverse.Syntax;

var cacheExempt = [
  'flip',
  'randomInteger',
  'discrete',
  'gaussian',
  'uniform',
  'uniformDraw',
  'dirichlet',
  'poisson',
  'binomial',
  'beta',
  'exponential',
  'gamma',
  'factor',
  'sample',
  'sampleWithFactor'
];
var cacheExemptTable = {};
_.each(cacheExempt, function(funcName) {
  cacheExemptTable[funcName] = true;
});
cacheExempt = cacheExemptTable;

function shouldCache(callee) {
  // Don't cache 'primitive' functions. It actually could be beneficial to cache
  //    these in some cases, but correctly binding 'this' will require some
  //    systemic changes that I don't want to deal with right now.
  if (isPrimitive(callee))
    return false;
  // Don't cache sampling helpers or other coroutine functions that
  // deal with distributions.
  // Why do this? If the cache adaptation decides to remove one of these functions,
  //    then that function will have the same address as the distribution it's dealing with,
  //    so the adapter will also try to remove the distribution.
  // Basically, a core assumption of IncrementalMH is that all cache nodes have unique
  //    addresses.
  if (callee.type === Syntax.Identifier && cacheExempt[callee.name])
    return false;
  // Otherwise, go ahead
  return true;
}

function exit(node) {
  switch (node.type) {
    case Syntax.CallExpression:
      if (shouldCache(node.callee)) {
        return build.callExpression(
            build.identifier('incrementalize'),
            [node.callee, build.arrayExpression(node.arguments)]
        );
      }
    default:
  }
}

function cachingMain(node) {
  return estraverse.replace(node, { leave: exit });
}


function isImhIdentifier(node) {
  return node.type === 'Identifier' && node.name === 'IncrementalMH';
}

function isImhInferMethodOption(node) {
  return node.type === 'Property' &&
      ((node.key.type === 'Identifier' && node.key.name === 'method') ||
      (node.key.type === 'Literal' && node.key.value === 'method')) &&
      (node.value.type === 'Literal' && node.value.value === 'IncrementalMH');
}

function transformRequired(programAST) {
  var flag = false;
  estraverse.traverse(programAST, {
    enter: function(node) {
      if (isImhIdentifier(node) || isImhInferMethodOption(node)) {
        flag = true;
        this.break();
      }
    }
  });
  return flag;
}

function hasNoCachingDirective(ast) {
  return ast.body.length > 0 &&
         ast.body[0].type === Syntax.ExpressionStatement &&
         ast.body[0].expression.type === Syntax.Literal &&
         ast.body[0].expression.value === 'no caching';
}

module.exports = {
  transform: cachingMain,
  transformRequired: transformRequired,
  hasNoCachingDirective: hasNoCachingDirective
};
