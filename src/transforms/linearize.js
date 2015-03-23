'use strict';

var Syntax = require('estraverse').Syntax;
var build = require('ast-types').builders;
var types = require('ast-types').namedTypes;

var match = require('../syntaxUtils').match;
var clause = require('../syntaxUtils').clause;
var fail = require('../syntaxUtils').fail;


function hasReturn(node) {
  return match(node, [
    clause(Syntax.BlockStatement, function(body) {
      return body.some(hasReturn);
    }),
    clause(Syntax.IfStatement, function(test, consequent, alternate) {
      return hasReturn(consequent) || hasReturn(alternate);
    }),
    clause(Syntax.Program, function(body) {
      return body.some(hasReturn);
    }),
    clause(Syntax.ReturnStatement, function(argument) {
      return true;
    })], function() {
    return false;
  });
}

function linearizeSequence(ss, i, ks) {
  if (i === ss.length) {
    return ks;
  }
  else {
    ks = linearizeSequence(ss, i + 1, ks);

    return match(ss[i], [
      clause(Syntax.BlockStatement, function(body) {
        return linearizeSequence(body, 0, ks);
      }),
      clause(Syntax.IfStatement, function(test, consequent, alternate) {
        if (alternate === null) {
          alternate = build.emptyStatement();
        }

        if (hasReturn(consequent) || hasReturn(alternate)) {
          return [build.ifStatement(
              test,
              build.blockStatement(linearizeSequence([consequent], 0, ks)),
              build.blockStatement(linearizeSequence([alternate], 0, ks)))];
        }
        else {
          return [build.ifStatement(test, consequent, alternate)].concat(ks);
        }
      }),
      clause(Syntax.ReturnStatement, function(argument) {
        return [build.expressionStatement(argument)];
      })], function() {
      if (types.EmptyStatement.check(ss[i]) ||
          types.ExpressionStatement.check(ss[i]) ||
          types.VariableDeclaration.check(ss[i])) {
        return [ss[i]].concat(ks);
      }
      else return fail('linearize: unrecognized node', ss[i])();
    });
  }
}

function linearize(nodes) {
  return linearizeSequence(nodes, 0, []);
}

exports.linearize = linearize;
