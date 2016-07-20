'use strict';

var _ = require('underscore');
var Syntax = require('estraverse').Syntax;
var replace = require('estraverse').replace;
var build = require('./builders');


var makeGensym = require('../util').makeGensym;
var makeGenvar = require('../syntax').makeGenvar;
var inProgram = require('../syntax').inProgram;
var fail = require('../syntax').fail;
var isPrimitive = require('../syntax').isPrimitive;


function makeGenlit() {
  var gensym = makeGensym();
  return function() {
    return build.literal(gensym('_'));
  };
}

var genlit = null;
var genvar = null;

var addresses = [];

function makeAddressExtension(address, literal) {
  return build.callExpression(
      build.memberExpression(address,
                             build.identifier('concat'),
                             false),
      [literal]);
}

function generating(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      addresses.unshift(genvar('address'));
      break;
    default:
  }
}

function naming(node, map) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      return build.functionExpression(node.id,
          [addresses.shift()].concat(node.params),
          node.body);

    // add a gensym onto the address variable
    case Syntax.CallExpression:
      if (isPrimitive(node.callee)) {
        return node;
      } else {
        var lit = genlit();
        var name = node.callee.type === Syntax.Identifier ? node.callee.name : null;
        map[lit.value] = _.extendOwn({name: name}, node.loc);
        return build.callExpression(node.callee,
            [makeAddressExtension(addresses[0], lit)].concat(node.arguments), node.loc);
      }

    default:
  }
}

function namingMain(node) {
  genlit = makeGenlit();
  genvar = makeGenvar();
  var map = {};
  var ast = inProgram(function(node) {
    return replace(node, {
      enter: generating,
      leave: function(node) { return naming(node, map); }
    });
  })(node, fail('naming: inProgram', node));
  return {ast: ast, map: map};
}

module.exports = {
  naming: namingMain
};
