'use strict';

var assert = require('assert');
var Syntax = require('estraverse').Syntax;
var replace = require('estraverse').replace;
var build = require('ast-types').builders;

var local = '_currentAddress';
var global = '_globalCurrentAddress';
var saveAddressFn = ['_addr', 'save'];

// Transform a function body so that the entry address is:

// 1. available throughout as a local variable.
// 2. written to a global variable before the main body of the
// function is evaluated.

function transformFnBody(node) {
  var addressParam = node.params[0];

  var bindAddress = build.variableDeclaration('var', [
    build.variableDeclarator(
        build.identifier(local),
        addressParam)]);

  // Use member expression so that this isn't cps'd. Writing as an
  // assignment statement doesn't work as it is wrapped in a thunk and
  // returned early from the function.
  var saveAddress = build.expressionStatement(
      build.callExpression(
      build.memberExpression(
      build.identifier(saveAddressFn[0]),
      build.identifier(saveAddressFn[1])
      ), [
        build.identifier(global),
        addressParam]));

  var expr = build.functionExpression(
      node.id,
      node.params,
      build.blockStatement([bindAddress, saveAddress].concat(node.body.body))
      );
  expr.loc = node.loc;
  return expr;
}

function transformF(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      return transformFnBody(node);
    default:
      return node;
  }
}

// TODO: When unnecessary continuations are optimized away, *lots* of
// calls to the save address function are left behind. Make them go
// away. (Note, switching to an assignment expression here doesn't
// help.)

// Transform a continuation so that the current address is written to
// a global variable when the continuation is invoked. This serves two
// purposes:

// 1. Update the address when we "return" from a function.
// 2. Ensure the address in the global variable is consistent with the
// current address when we switch execution paths during inference.

function transformContinuation(node) {
  var saveAddress = build.expressionStatement(
      build.callExpression(
      build.memberExpression(
      build.identifier(saveAddressFn[0]),
      build.identifier(saveAddressFn[1])
      ), [
        build.identifier(global),
        build.identifier(local)]));

  var expr = build.functionExpression(
      node.id,
      node.params,
      build.blockStatement([saveAddress].concat(node.body.body))
      );
  expr.loc = node.loc;
  return expr;
}

// The store, naming and cps transforms have happened, so regular
// functions have 3+ parameters, continuations have 2.
function isContinuation(node) {
  return node.params.length === 2;
}

function transformK(node) {
  switch (node.type) {
    case Syntax.FunctionExpression:
      if (isContinuation(node)) {
        return transformContinuation(node);
      } else {
        return node;
      }
    default:
      return node;
  }
}

// Wrap the program node in a function to bind the variable used to
// track the current address.

function wrapProgram(node) {
  var expr = node.body[0].expression;
  assert.ok(expr.type === Syntax.CallExpression);
  return build.program([
    build.expressionStatement(
        build.functionExpression(
        null,
        [build.identifier(global)],
        build.blockStatement([
          build.returnStatement(expr)
        ])))]);
}

module.exports = {
  transformF: function(node) {
    return replace(node, {
      leave: transformF
    });
  },
  transformK: function(node) {
    return replace(node, {
      leave: transformK
    });
  },
  wrapProgram: wrapProgram
};
