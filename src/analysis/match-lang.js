'use strict';
var types = require('ast-types').namedTypes;

function contParam(node) {
  return node.params[0].name;
}

function isContinuationFunc(f) {
  return f.params.length === 1;
}

function destructContExp(node, succeed, fail) {
  if (types.FunctionExpression.check(node) &&
      isContinuationFunc(node) &&
      types.BlockStatement.check(node.body) &&
      types.ExpressionStatement.check(node.body.body[0])) {
    return succeed(contParam(node), node.body.body[0].expression);
  }
  else return fail();
}

function funcParams(node) {
  return node.params.slice(2).map(function(param) {
    return param.name;
  });
}

function destructFuncExp(node, succeed, fail) {
  if (types.FunctionExpression.check(node)) {
    if (! isContinuationFunc(node)) {
      return succeed(funcParams(node), node.body);
    }
    else return fail();
  }
  else return fail();
}

function destructCondExp(node, succeed, fail) {
  if (types.ConditionalExpression.check(node)) {
    return succeed(node.test, node.consequent, node.alternate);
  }
  else return fail();
}

function isContinuationCall(call) {
  return call.arguments.length === 1;
}

function destructContCall(node, succeed, fail) {
  if (types.CallExpression.check(node) &&
      isContinuationCall(node)) {
    return succeed(node.callee, node.arguments[0]);
  }
  else return fail();
}

function callSiteLabel(node) {
  return node.arguments[1].arguments[0].value;
}

function destructUserCall(node, succeed, fail) {
  if (types.CallExpression.check(node) &&
      (! isContinuationCall(node))) {
    return succeed(callSiteLabel(node),
                   node.callee,
                   node.arguments.slice(2),
                   node.arguments[0]);
  }
  else return fail();
}

function destructSampleExp(node, succeed, fail) {
  if (types.CallExpression.check(node) &&
      (! isContinuationCall(node)) &&
      types.Identifier.check(node.callee) &&
      node.callee.name === 'sample') {
    return succeed(callSiteLabel(node),
                   node.arguments[2],
                   node.arguments[3].elements,
                   node.arguments[0]);
  }
  else return fail();
}

// the inferencers, like Enumerate, probably aren't special forms
// but I'm going to treat them as such.
function destructEnumerateExp(node, succeed, fail) {
  if (types.CallExpression.check(node) &&
      (! isContinuationCall(node)) &&
      types.Identifier.check(node.callee) &&
      node.callee.name === 'Enumerate') {
    return succeed(callSiteLabel(node),
                   node.arguments[2],
                   node.arguments[3],
                   node.arguments[0]);
  }
  else return fail();
}


module.exports = {
  condExp: destructCondExp,
  contCall: destructContCall,
  contExp: destructContExp,
  funcExp: destructFuncExp,
  sampleExp: destructSampleExp,
  enumerateExp: destructEnumerateExp,
  userCall: destructUserCall
}
