'use strict';

var estraverse = require('estraverse');
var Syntax = estraverse.Syntax;
var build = require('ast-types').builders;
var isPrimitive = require('../syntax').isPrimitive;


var storeIdNode = build.identifier('globalStore');

function store(node) {
  switch (node.type) {
    // have to add the store argument to each function
    case Syntax.FunctionExpression:
      return build.functionExpression(node.id,
          [storeIdNode].concat(node.params),
          node.body);

    // pass the store variable at each call (that isn't primitive)
    case Syntax.CallExpression:
      if (isPrimitive(node.callee)) {
        return node;
      }
      else if (node.arguments.length > 0 &&
          node.arguments[0].type === 'Identifier' &&
          node.arguments[0].name === 'globalStore') {
        return node;
      }
      else {
        return build.callExpression(node.callee,
            [storeIdNode].concat(node.arguments));
      }

    default:
      return node;
  }
}


function storeMain(node) {
  return estraverse.replace(node, {leave: store});
}

module.exports = {
  store: storeMain
};
