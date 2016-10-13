'use strict';

var estraverse = require('estraverse');
var build = require('./builders');

var rules = function(node) {
  switch (node.type) {
    case 'UnaryExpression':
      switch (node.operator) {
        // ad.scalar.plus is defined in src/ad.js
        case '+': return 'ad.scalar.plus';
        case '-': return 'ad.scalar.neg';
      }
      break;
    case 'BinaryExpression':
      switch (node.operator) {
        case '*': return 'ad.scalar.mul';
        case '/': return 'ad.scalar.div';
        case '+': return 'ad.scalar.add';
        case '-': return 'ad.scalar.sub';
        case '<': return 'ad.scalar.lt';
        case '<=': return 'ad.scalar.leq';
        case '>': return 'ad.scalar.gt';
        case '>=': return 'ad.scalar.geq';
        case '==': return 'ad.scalar.eq';
        case '!=': return 'ad.scalar.neq';
        case '===': return 'ad.scalar.peq';
        case '!==': return 'ad.scalar.pneq';
      }
      break;
  }
  return false;
};

// Parse a dotted identifier.
// e.g. 'ad.scalar' => memberExpr(identifer('ad'), identifer('scalar'))
function parse(dotted) {
  return dotted.split('.')
      .map(build.identifier)
      .reduce(function(a, b) { return build.memberExpression(a, b); });
}

function rewrite(node, fn) {
  var callee = parse(fn);
  if (node.type === 'UnaryExpression') {
    return build.callExpression(callee, [node.argument]);
  } else if (node.type === 'BinaryExpression') {
    return build.callExpression(callee, [node.left, node.right]);
  } else {
    throw new Error('Unexpected node type');
  }
}

function isInplaceAssignmentOp(op) {
  return op === '+=' || op === '-=' || op === '*=' || op === '/=';
}

function ad(ast) {
  return estraverse.replace(ast, {
    enter: function(node, parent) {
      // Re-write operators
      var fn = rules(node);
      if (fn) {
        return rewrite(node, fn);
      }
      // Expand in-place assignment operators
      if (node.type === 'AssignmentExpression' &&
          isInplaceAssignmentOp(node.operator)) {
        return build.assignmentExpression(
            '=', node.left,
            build.binaryExpression(node.operator[0], node.left, node.right));
      }
      // Re-write Math.*
      if (node.type === 'MemberExpression' &&
          node.object.type === 'Identifier' &&
          node.object.name === 'Math') {
        return build.memberExpression(parse('ad.scalar'), node.property);
      }
    }
  });
}

module.exports = {
  ad: ad
};
