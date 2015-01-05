"use strict";

var estraverse = require("estraverse");
var types = require("ast-types");

var build = types.builders;
var Syntax = estraverse.Syntax;

function makeNextCounter() {
    var gensym = util.makeGensym();

    return function() {
	return build.literal(gensym("_"));
    }
}

var nextCounter = null;

var addressIdNode = build.identifier("address");

function makeAddressExtension(){
  return build.callExpression(build.memberExpression(addressIdNode,
                                                     build.identifier("concat"),
                                                     false),
                              [nextCounter()]);
}

function naming(node) {

  switch (node.type) {

    //have to add an address argument to each function
  case Syntax.FunctionExpression:
    return build.functionExpression(node.id,
                                    [addressIdNode].concat(node.params),
                                    node.body);

    //add a gensym onto the address variable
  case Syntax.CallExpression:
    if(types.namedTypes.MemberExpression.check(node.callee)){
      return node;
    } else {
      return build.callExpression(node.callee,
                                  [makeAddressExtension()].concat(node.arguments));
    }

  default:
    return node;

  }
}


function namingMain(node) {
  nextCounter = makeNextCounter();
  return estraverse.replace(node, { leave: naming });
}




module.exports = {
  naming: namingMain
};
