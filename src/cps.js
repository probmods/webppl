'use strict';

var assert = require('assert');
var build = require('ast-types').builders;
var types = require('ast-types').namedTypes;
var Syntax = require('estraverse').Syntax;

var match = require('./util2').match;
var clause = require('./util2').clause;
var fail = require('./util2').fail;
var inProgram = require('./util2').inProgram;
var linearize = require('./linearize').linearize;
var isPrimitive = require('./util2').isPrimitive;
var makeGenvar = require('./util2').makeGenvar;


var genvar = null;

function buildFunction(params, body, id) {
  return build.functionExpression(id || null, params,
                                  build.blockStatement([build.expressionStatement(body)]));
}

function buildCall(callee, args) {
  return build.callExpression(callee, args);
}

function buildContinuation(param, body) {
  return buildFunction([param], body);
}

function buildContinuationCall(callee, arg) {
  return buildCall(callee, [arg]);
}

function cpsFunction(id, params, body) {
  var k = genvar('k');
  return buildFunction([k].concat(params), cpsSequence(linearize(body.body), 0, k), id);
}

function bindContinuation(k, K) {
  if (types.Identifier.check(k)) {
    return K(k);
  }
  else {
    var k0 = genvar('k');
    return buildCall(buildFunction([k0], K(k0)), [k]);
  }
}

function isAtomic(node) {
  switch (node.type) {
    case Syntax.ArrayExpression:
      return node.elements.every(isAtomic);
    case Syntax.BinaryExpression:
      return isAtomic(node.left) && isAtomic(node.right);
    case Syntax.CallExpression:
      return isPrimitive(node.callee) && node.arguments.every(isAtomic);
    case Syntax.ConditionalExpression:
      return isAtomic(node.test) && isAtomic(node.consequent) && isAtomic(node.alternate);
    case Syntax.FunctionExpression:
    case Syntax.Identifier:
    case Syntax.Literal:
      return true;
    case Syntax.LogicalExpression:
      return isAtomic(node.left) && isAtomic(node.right);
    case Syntax.MemberExpression:
      return isAtomic(node.object) && isAtomic(node.property);
    case Syntax.ObjectExpression:
      return node.properties.every(function(property) {
        return isAtomic(property.key) && isAtomic(property.value);
      });
    case Syntax.UnaryExpression:
      return isAtomic(node.argument);
    default:
      console.log(node);
      console.log('isAtomic');
      throw 'isAtomic';
  }
}

function atomize(node, K) {
  if (isAtomic(node)) {
    switch (node.type) {
      case Syntax.FunctionExpression:
        return K(cpsFunction(node.id, node.params, node.body));
      default:
        return K(node);
    }
  }
  else {
    switch (node.type) {
      case Syntax.ArrayExpression:
        return atomizeStar(node.elements, function(elements) {
          return K(build.arrayExpression(elements));
        });
      case Syntax.BinaryExpression:
      case Syntax.CallExpression:
      case Syntax.ConditionalExpression:
        var x = genvar('result');
        return cps(node, buildContinuation(x, K(x)));
      case Syntax.MemberExpression:
        return atomize(node.object, function(object) {
          return atomize(node.property, function(property) {
            return K(build.memberExpression(object, property, node.computed));
          });
        });
      default:
        console.log(node);
        console.log('atomize');
        throw 'atomize';
    }
  }
}

function atomizeStar(es, K) {
  es = es.concat();

  function loop(i) {
    if (i === es.length) {
      return K(es);
    }
    else {
      return atomize(es[i], function(e) {
        es[i] = e;
        return loop(i + 1);
      });
    }
  }

  return loop(0);
}

function cps(node, k) {
  switch (node.type) {
    case Syntax.Identifier:
    case Syntax.Literal:
      return buildContinuationCall(k, node);
    default:
      return match(node, [
        clause(Syntax.ArrayExpression, function(elements) {
          return atomizeStar(elements, function(elements) {
            return buildContinuationCall(k, build.arrayExpression(elements));
          });
        }),
        clause(Syntax.AssignmentExpression, function(left, right) {
          return atomize(left, function(left) {
            return atomize(right, function(right) {
              return buildContinuationCall(k, build.assignmentExpression(node.operator, left, right));
            });
          });
        }),
        clause(Syntax.BinaryExpression, function(left, right) {
          return atomize(left, function(left) {
            return atomize(right, function(right) {
              return buildContinuationCall(k, build.binaryExpression(node.operator, left, right));
            });
          });
        }),
        clause(Syntax.CallExpression, function(callee, args) {
          if (isPrimitive(callee)) {
            return atomize(callee, function(callee) {
              return atomizeStar(args, function(args) {
                return buildContinuationCall(k, buildCall(callee, args));
              });
            });
          }
          else {
            return atomize(callee, function(callee) {
              return atomizeStar(args, function(args) {
                return buildCall(callee, [k].concat(args));
              });
            });
          }
        }),
        clause(Syntax.ConditionalExpression, function(test, consequent, alternate) {
          return bindContinuation(k, function(k) {
            return atomize(test, function(test) {
              return build.conditionalExpression(test, cps(consequent, k), cps(alternate, k));
            });
          });
        }),
        clause(Syntax.FunctionExpression, function(id, params, defaults, rest, body) {
          return buildContinuationCall(k, cpsFunction(id, params, body));
        }),
        clause(Syntax.LogicalExpression, function(left, right) {
          return atomize(left, function(left) {
            if (node.operator === '||') {
              return build.conditionalExpression(left, cps(left, k), cps(right, k));
            }
            else if (node.operator === '&&') {
              return build.conditionalExpression(left, cps(right, k), cps(left, k));
            }
            else {
              console.log(node.operator);
              throw new Error('cps: unhandled logical operator ' + node.operator);
            }
          });
        }),
        clause(Syntax.MemberExpression, function(object, property) {
          return atomize(object, function(object) {
            return atomize(property, function(property) {
              return buildContinuationCall(k, build.memberExpression(object, property, node.computed));
            });
          });
        }),
        clause(Syntax.UnaryExpression, function(argument) {
          return atomize(argument, function(argument) {
            return buildContinuationCall(k, build.unaryExpression(node.operator, argument));
          });
        })], fail("can't cps", node));
  }
}

function cpsDeclarations(declarations, i, K) {
  return clause(Syntax.VariableDeclarator, function(id, init) {
    if (types.FunctionExpression.check(init)) {
      init.id = id;
    }

    if (i + 1 === declarations.length) {
      return cps(init, K(id));
    }
    else {
      return cps(init, buildContinuation(id, cpsDeclarations(declarations, i + 1, K)));
    }
  })(declarations[i], fail('expected declarator', declarations[i]));
}

function cpsSequence(nodes, i, k) {
  if (i === nodes.length) {
    return cps(build.identifier('undefined'), k);
  }
  else if (i + 1 === nodes.length) {
    return match(nodes[i], [
      clause(Syntax.BlockStatement, function(body) {
        return cpsSequence(body, 0, k);
      }),
      clause(Syntax.EmptyStatement, function() {
        return cps(build.identifier('undefined'), k);
      }),
      clause(Syntax.ExpressionStatement, function(expression) {
        return cps(expression, k);
      }),
      clause(Syntax.IfStatement, function(test, consequent, alternate) {
        return bindContinuation(k, function(k) { // most likely unnecessary
          return atomize(test, function(test) {
            return build.conditionalExpression(test,
                                               cpsSequence(consequent.body, 0, k),
                                               cpsSequence(alternate.body, 0, k));
          });
        });
      }),
      clause(Syntax.ReturnStatement, function(argument) {
        return cps(argument, k);
      }),
      clause(Syntax.VariableDeclaration, function(declarations) {
        return cpsDeclarations(declarations, 0, function(id) {
          return buildContinuation(id, cpsSequence(nodes, i + 1, k));
        });
      })], fail('last one', nodes[i]));
  }
  else {
    return match(nodes[i], [
      clause(Syntax.BlockStatement, function(body) {
        return cpsSequence(body, 0, buildContinuation(genvar('dummy'), cpsSequence(nodes, i + 1, k)));
      }),
      clause(Syntax.EmptyStatement, function() {
        return cpsSequence(nodes, i + 1, k);
      }),
      clause(Syntax.ExpressionStatement, function(expression) {
        return cps(expression, buildContinuation(genvar('dummy'), cpsSequence(nodes, i + 1, k)));
      }),
      clause(Syntax.IfStatement, function(test, consequent, alternate) {
        return bindContinuation(k, function(k) { // most likely unnecessary
          return atomize(test, function(test) {
            return build.conditionalExpression(test,
                                               cpsSequence(consequent.body, 0, k),
                                               cpsSequence(alternate.body, 0, k));
          });
        });
      }),
      clause(Syntax.ReturnStatement, function(argument) {
        return cps(argument, k);
      }),
      clause(Syntax.VariableDeclaration, function(declarations) {
        return cpsDeclarations(declarations, 0, function(id) {
          return buildContinuation(id, cpsSequence(nodes, i + 1, k));
        });
      })], fail('unknown deal', nodes[i]));
  }
}

function cpsMain(node) {
  genvar = makeGenvar();

  return inProgram(function(expression) {
    return clause(Syntax.FunctionExpression, function(id, params, defaults, rest, body) {
      return cpsFunction(id, params, body);
    })(expression, fail('cps: expected FunctionExpression', expression));
  })(node, fail('cps: inProgram', node));
}

module.exports = {
  cps: cpsMain
};

