"use strict";

var estraverse = require("estraverse");
var types = require("ast-types");

var build = types.builders;
var Syntax = estraverse.Syntax;

var storeIdNode = build.identifier("globalStore");

function store(node) {
  if (node.seenByStorepassing){
    return node;
  }
  node.seenByStorepassing = true;

  switch (node.type) {

  // have to add the store argument to each function
  case Syntax.FunctionExpression:
    return build.functionExpression(node.id,
                                    [storeIdNode].concat(node.params),
                                    node.body);

  // pass the store variable at each call (that isn't primitive)
  case Syntax.CallExpression:
    if(types.namedTypes.MemberExpression.check(node.callee)){
      return node;
    } else {
      return build.callExpression(node.callee,
                                  [storeIdNode].concat(node.arguments));
    }

  default:
    return node;

  }
}


function storeMain(node) {
  var out = estraverse.replace(
    node,
    {leave: function(node){return store(node);}});
  return out;
}


module.exports = {
  store: storeMain
};


/*
  TODO:
  -finish adding store args in header.js: MH, PFR
  -should globalStore actually be the js global object? or in it?
*/
