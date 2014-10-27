"use strict";

var estraverse = require("estraverse");
var types = require("ast-types");

var build = types.builders;
var Syntax = estraverse.Syntax;

var storeIdNode = build.identifier("globalStore")

function store(node) {
  switch (node.type) {

  // have to add the store argument to each function
  case Syntax.FunctionExpression:
    if (node.params && (node.params[0].name === storeIdNode.name)){
      // this is a hack to prevent multiple additions of store arg
      // FIXME: understand why this is necessary and solve the
      // cause of the problem
      return node;
    }
    return build.functionExpression(node.id,
                                    [storeIdNode].concat(node.params),
                                    node.body)

  // pass the store variable at each call (that isn't primitive)
  case Syntax.CallExpression:
    if(types.namedTypes.MemberExpression.check(node.callee)){
      return node
    } else {
      if (node.arguments.length && 
          types.namedTypes.Identifier.check(node.arguments[0]) &&
          node.arguments[0].name === storeIdNode.name) {
        // this is a hack to prevent multiple additions of store arg (see above)
        return node;
      }
      return build.callExpression(node.callee,
                                  [storeIdNode].concat(node.arguments))
    }

  default:
    return node

  }
}


function storeMain(node) {
  return estraverse.replace(
    node,
    {leave: function(node){return store(node)}})
}


module.exports = {
  store: storeMain
};


/*
  TODO:
  -finish adding store args in header.js: MH, PFR
  -should globalStore actually be the js global object? or in it?
*/


