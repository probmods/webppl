'use strict';

var _ = require('underscore');

var Syntax = require('estraverse').Syntax;
var replace = require('estraverse').replace;
var build = require('ast-types').builders;
var types = require('ast-types').types;
var isPrimitive = require('../syntax').isPrimitive;


// TODO: Auto-extract this list, somehow?
var knownERPs = [
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
  'factor'
];
var knownERPtable = {};
_.each(knownERPs, function(erpname) {
  knownERPtable[erpname] = true;
});
knownERPs = knownERPtable;

function shouldCache(callee) {
  // Don't cache 'primitive' functions. It actually could be benficial to cache
  //    these in some cases, but correctly binding 'this' will require some
  //    systemic changes that I don't want to deal with right now.
  if (isPrimitive(callee))
    return false;
  // Don't cache ERPs, because those are already handled specially
  //    (Caching them isn't wrong, it's just unnecessary)
  if (callee.type === Syntax.Identifier && knownERPs[callee.name])
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
  return replace(node, { leave: exit });
}

module.exports = {
  caching: cachingMain
};
