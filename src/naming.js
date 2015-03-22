'use strict';

var Syntax = require('estraverse').Syntax;
var replace = require('estraverse').replace;

var build = require('ast-types').builders;
var types = require('ast-types').types;

var makeGensym = require('./util').makeGensym;
var makeGenvar = require('./util2').makeGenvar;

var inProgram = require('./util2').inProgram;
var fail = require('./util2').fail;

var isPrimitive = require('./util2').isPrimitive;

function makeGenlit() {
  var gensym = makeGensym();

  return function() {
    return build.literal(gensym('_'));
  }
}

var genlit = null;
var genvar = null;

var addresses = [];

function makeAddressExtension(address) {
  return build.callExpression(build.memberExpression(address,
                                                     build.identifier('concat'),
                                                     false),
                              [genlit()]);
}

function generating(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      addresses.unshift(genvar('address'));
      break;
    default:
  }
}

function naming(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      return build.functionExpression(node.id,
          [addresses.shift()].concat(node.params),
          node.body);

    //add a gensym onto the address variable
    case Syntax.CallExpression:
      if (isPrimitive(node.callee)) {
        return node;
      }
      else {
        return build.callExpression(node.callee,
            [makeAddressExtension(addresses[0])].concat(node.arguments));
      }

    default:
  }
}

function namingMain(node) {
  genlit = makeGenlit();
  genvar = makeGenvar();

  return inProgram(function(node) {
    return replace(node, { enter: generating, leave: naming });
  })(node, fail('naming: inProgram', node));
}

module.exports = {
  naming: namingMain
};
