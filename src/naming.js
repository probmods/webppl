"use strict";

var assert = require('assert');
var _ = require('underscore');
var estraverse = require("estraverse");
var escodegen = require("escodegen");
var esprima = require("esprima");
var estemplate = require("estemplate");
var types = require("ast-types");
var util = require('./util.js');

var build = types.builders;
var Syntax = estraverse.Syntax;

var counter = 0
function nextCounter(){
  counter++
  return build.literal("_"+counter)//build.arrayExpression([build.literal(counter)])
}

var addressIdNode = build.identifier("address")

function makeAddressExtension(){
  return build.callExpression(build.memberExpression(addressIdNode,
                                                     build.identifier("concat"),
                                                     false),
                              [nextCounter()])
}

function naming(node) {
//  console.log(node)
  switch (node.type) {
      
     
      //have to add an address argument to each function
    case Syntax.FunctionExpression:
      return build.functionExpression(node.id,
                                      [addressIdNode].concat(node.params),
                                      node.body)
      
      //add a gensym onto the address variable
    case Syntax.CallExpression:
      if(types.namedTypes.MemberExpression.check(node.callee)){
        return node
      } else {
        return build.callExpression(node.callee,
                                    [makeAddressExtension()].concat(node.arguments))
      }
      
      
      
//      //binary and unary are actually calls, but deterministic so don't need to extend address..
//    case Syntax.UnaryExpression:
//    case Syntax.BinaryExpression:
      
//    case Syntax.IfStatement:
//    case Syntax.ConditionalExpression:
//    case Syntax.ArrayExpression:
//    case Syntax.ObjectExpression:
//    case Syntax.MemberExpression:
      
//    case Syntax.BlockStatement:
//      return cpsBlock(node.body, cont);
//      
//    case Syntax.Program:
//      return
//      
//    case Syntax.ReturnStatement:
//      return
//      
//    case Syntax.ExpressionStatement:
//      return
//      
//    case Syntax.EmptyStatement:
//    case Syntax.Identifier:
//    case Syntax.Literal:
//    case Syntax.VariableDeclaration:
      
      
    default:
      return node

  }
}


function namingMain(node) {
  
  return estraverse.replace(node,
                             {//enter: function(node){return node},
                             leave: function(node){return naming(node)}})
}




module.exports = {
naming: namingMain
};