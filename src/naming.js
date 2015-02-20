"use strict";

var estraverse = require("estraverse");
var types = require("ast-types");

var build = types.builders;
var Syntax = estraverse.Syntax;

var counter = 0;
function nextCounter(){
  counter++;
  return build.literal("_"+counter);//build.arrayExpression([build.literal(counter)])
}

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
  counter = 0;
  return estraverse.replace(node,
                            {//enter: function(node){return node},
                              leave: function(node){return naming(node);}});
}




module.exports = {
  naming: namingMain
};
