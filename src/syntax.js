'use strict';

var types = require('ast-types').namedTypes;
var build = require('ast-types').builders;
var keys = require('estraverse').VisitorKeys;
var Syntax = require('estraverse').Syntax;


function makeGenvar() {
  var gensym = require('./util').makeGensym();
  return function(name) {
    return build.identifier('_'.concat(gensym(name)));
  };
}

function fail(message, node) {
  return function() {
    console.log(node);
    console.log(message);
    throw new Error(message);
  };
}

// a clause matches a node type and calls a destructor with constituents
// a clause is a function from a node and failure thunk to a result
function clause(type, destructor) {
  return function(node, fail) {
    if (types.hasOwnProperty(type)) {
      if (types[type].check(node)) {
        return destructor.apply(this, keys[type].map(function(key) {
          return node[key];
        }));
      }
      else {
        return fail();
      }
    }
    else {
      throw new Error('no type ' + type);
    }
  };
}

function match(node, clauses, fail) {
  for (var i = 0; i < clauses.length; i++) {
    var failed = false;
    var value = clauses[i](node, function() {failed = true});
    if (!failed) {
      return value;
    }
  }
  return fail();
}

function failSafe(who, fail) {
  if (typeof fail === 'function') {
    return fail();
  }
  else {
    throw new Error(who + ': fail is not a function');
  }
}

function inProgram(f, fail) {
  return function(node) {
    if (types.Program.check(node) &&
        node.body.length === 1 &&
        types.ExpressionStatement.check(node.body[0])) {
      return build.program([
        build.expressionStatement(f(node.body[0].expression))
      ]);
    }
    else {
      return failSafe('inProgram', fail);
    }
  };
}

function inBody(f, fail) {
  return inProgram(function(node) {
    if (types.FunctionExpression.check(node)) {
      return build.functionExpression(
          node.id,
          node.params,
          build.blockStatement(f(build.program(node.body.body)).body));
    }
    else {
      return failSafe('inBody', fail);
    }
  }, fail);
}

function returnify(nodes) {
  if (nodes.length === 0) {
    return nodes;
  }
  else {
    nodes[nodes.length - 1] = match(nodes[nodes.length - 1], [
      clause(Syntax.BlockStatement, function(body) {
        return build.blockStatement(returnify(body));
      }),
      clause(Syntax.EmptyStatement, function() {
        return build.emptyStatement();
      }),
      clause(Syntax.ExpressionStatement, function(expression) {
        return build.returnStatement(expression);
      }),
      clause(Syntax.IfStatement, function(test, consequent, alternate) {
        return build.ifStatement(
            test,
            build.blockStatement(returnify(consequent.body)),
            alternate === null ? null : build.blockStatement(returnify(alternate.body)));
      }),
      clause(Syntax.ReturnStatement, function(argument) {
        return build.returnStatement(argument);
      })
    ], fail('returnify', nodes[nodes.length - 1]));

    return nodes;
  }
}

function isPrimitive(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
    case Syntax.Identifier:
    case Syntax.CallExpression:
      return false;
    case Syntax.MemberExpression:
      return (types.Identifier.check(node.object) ||
          (!node.computed) && types.Identifier.check(node.property));
    default:
      console.log(node);
      throw "isPrimitive doesn't handle node";
  }
}


function thunkify(node, fail) {
  if (types.Program.check(node)) {
    return build.program([
      build.expressionStatement(
          build.functionExpression(
          null,
          [],
          build.blockStatement(returnify(node.body))
          )
      )
    ]);
  }
  else {
    return failSafe('thunkify', fail);
  }
}

module.exports = {
  makeGenvar: makeGenvar,
  fail: fail,
  clause: clause,
  match: match,
  thunkify: thunkify,
  inProgram: inProgram,
  inBody: inBody,
  isPrimitive: isPrimitive
};
