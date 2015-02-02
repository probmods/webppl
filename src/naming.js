"use strict";

<<<<<<< HEAD
var estraverse = require("estraverse");
var types = require("ast-types");

var build = types.builders;
var Syntax = estraverse.Syntax;
=======
var Syntax = require("estraverse").Syntax;
var replace = require("estraverse").replace;

var build = require("ast-types").builders;
var types = require("ast-types").types;

var makeGensym = require("./util").makeGensym;
var makeGenvar = require("./util2").makeGenvar;

var functor = require("./util2").functor;
var fail = require("./util2").fail;

var isPrimitive = require("./primitive").isPrimitive;
>>>>>>> Standardization.

function makeGenlit() {
    var gensym = makeGensym();

    return function() {
	return build.literal(gensym("_"));
    }
}

var genlit = null;
var genvar = null;

var addresses = [];

function makeAddressExtension( address ) {
  return build.callExpression(build.memberExpression( address,
                                                      build.identifier("concat"),
                                                      false),
                              [genlit()]);
}

function generating( node ) {
    switch( node.type ) {
    case Syntax.FunctionExpression:
	addresses.unshift( genvar("address") );
	break;
    default:
    }
}

<<<<<<< HEAD
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
=======
function naming( node ) {
    switch( node.type ) {
    case Syntax.FunctionExpression:
	return build.functionExpression(node.id,
					[addresses.shift()].concat(node.params),
					node.body);

      //add a gensym onto the address variable
    case Syntax.CallExpression:
	if( isPrimitive( node.callee ) ) {
            return node;
	}
	else {
            return build.callExpression(node.callee,
					[makeAddressExtension(addresses[0])].concat(node.arguments));
	}

    default:
>>>>>>> Standardization.
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
