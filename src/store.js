"use strict";

//var assert = require('assert');
//var _ = require('underscore');
var estraverse = require("estraverse");
//var escodegen = require("escodegen");
//var esprima = require("esprima");
//var estemplate = require("estemplate");
var types = require("ast-types");
//var util = require('./util.js');

var build = types.builders;
var Syntax = estraverse.Syntax;

var storeIdNode = build.identifier("globalStore")

function store(node) {
  switch (node.type) {


      //have to add the store argument to each function
    case Syntax.FunctionExpression:
      return build.functionExpression(node.id,
                                      [storeIdNode].concat(node.params),
                                      node.body)

      //pass the store variable at each call (that isn't primitive)
    case Syntax.CallExpression:
      if(types.namedTypes.MemberExpression.check(node.callee)){
        return node
      } else {
        return build.callExpression(node.callee,
                                    [storeIdNode].concat(node.arguments))
      }

    default:
      return node

  }
}


function storeMain(node) {
  return estraverse.replace(node,
                             {//enter: function(node){return node},
                             leave: function(node){return store(node)}})
}


module.exports = {
store: storeMain
};


/*

TODO:
-finish adding store args in header.js: MH, PFR
-should globalStore actually be the js global object? or in it?
*/


