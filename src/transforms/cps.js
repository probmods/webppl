'use strict';

var assert = require('assert');
var build = require('ast-types').builders;
var types = require('ast-types').namedTypes;
var Syntax = require('estraverse').Syntax;

var match = require('../syntax').match;
var clause = require('../syntax').clause;
var fail = require('../syntax').fail;
var inProgram = require('../syntax').inProgram;
var isPrimitive = require('../syntax').isPrimitive;
var makeGenvar = require('../syntax').makeGenvar;


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
  return buildFunction([k].concat(params), cpsFinalStatement(body, k, k), id);
}

function bindContinuation(k, metaK) {
  if (types.Identifier.check(k)) {
    return metaK(k);
  }
  else {
    var k0 = genvar('k');
    return buildCall(buildFunction([k0], metaK(k0)), [k]);
  }
}

function atomize(node, metaK) {
  return match(node, [
    clause(Syntax.ArrayExpression, function(elements) {
      return atomizeStar(elements, function(elements) {
        return metaK(build.arrayExpression(elements));
      });
    }),
    clause(Syntax.AssignmentExpression, function(left, right) {
      assert(left.type === Syntax.MemberExpression &&
             left.object.name === 'globalStore',
             'Assignment is allowed only to fields of globalStore.');
      return atomize(left, function(left) {
        return atomize(right, function(right) {
          return metaK(build.assignmentExpression(node.operator, left, right));
        });
      });
    }),
    clause(Syntax.BinaryExpression, function(left, right) {
      return atomize(left, function(left) {
        return atomize(right, function(right) {
          return metaK(build.binaryExpression(node.operator, left, right));
        });
      });
    }),
    clause(Syntax.CallExpression, function(callee, args) {
      if (isPrimitive(callee)) {
        return atomize(callee, function(callee) {
          return atomizeStar(args, function(args) {
            return metaK(build.callExpression(callee, args));
          });
        });
      }
      else {
        var x = genvar('result');
        return cps(node, buildContinuation(x, metaK(x)));
      }
    }),
    clause(Syntax.ConditionalExpression, function(test, consequent, alternate) {
      return atomize(test, function(test) {
        var x = genvar('result');
        return bindContinuation(buildContinuation(x, metaK(x)), function(k) {
          return build.conditionalExpression(test, cps(consequent, k), cps(alternate, k));
        });
      });
    }),
    clause(Syntax.FunctionExpression, function(id, params, body) {
      return metaK(cpsFunction(id, params, body));
    }),
    clause(Syntax.Identifier, function() {
      return metaK(node);
    }),
    clause(Syntax.Literal, function() {
      return metaK(node);
    }),
    clause(Syntax.LogicalExpression, function(left, right) {
      return atomize(left, function(left) {
        var x = genvar('result');
        return bindContinuation(buildContinuation(x, metaK(x)), function(k) {
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
      });
    }),
    clause(Syntax.MemberExpression, function(object, property) {
      return atomize(object, function(object) {
        return atomize(property, function(property) {
          return metaK(build.memberExpression(object, property, node.computed));
        });
      });
    }),
    clause(Syntax.ObjectExpression, function(properties) {
      return atomizeStar(properties, function(properties) {
        return metaK(build.objectExpression(properties));
      });
    }),
    clause(Syntax.Property, function(key, value) {
      return atomize(value, function(value) {
        return metaK(build.property('init', key, value));
      });
    }),
    clause(Syntax.UnaryExpression, function(argument) {
      return atomize(argument, function(argument) {
        return metaK(build.unaryExpression(node.operator, argument));
      });
    })


  ], fail('atomize: unrecognized node', node));
}

function atomizeStar(es, metaK) {
  es = es.concat();

  function loop(i) {
    if (i === es.length) {
      return metaK(es);
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
    case Syntax.ArrayExpression:
    case Syntax.AssignmentExpression:
    case Syntax.BinaryExpression:
    case Syntax.FunctionExpression:
    case Syntax.Identifier:
    case Syntax.Literal:
    case Syntax.MemberExpression:
    case Syntax.ObjectExpression:
    case Syntax.UnaryExpression:
      return atomize(node, function(node) {
        return buildContinuationCall(k, node);
      });
    default:
      return match(node, [
        clause(Syntax.CallExpression, function(callee, args) {
          return atomize(callee, function(callee) {
            return atomizeStar(args, function(args) {
              if (isPrimitive(callee)) {
                return buildContinuationCall(k, buildCall(callee, args));
              }
              else {
                return buildCall(callee, [k].concat(args));
              }
            });
          });
        }),
        clause(Syntax.ConditionalExpression, function(test, consequent, alternate) {
          return atomize(test, function(test) {
            return bindContinuation(k, function(k) {
              return build.conditionalExpression(test, cps(consequent, k), cps(alternate, k));
            });
          });
        }),
        clause(Syntax.LogicalExpression, function(left, right) {
          return atomize(left, function(left) {
            return bindContinuation(k, function(k) {
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
          });
        })], fail("can't cps", node));
  }
}

function cpsDeclarations(declarations, i, metaK) {
  return clause(Syntax.VariableDeclarator, function(id, init) {
    if (types.FunctionExpression.check(init)) {
      init.id = id;
    }

    if (i + 1 === declarations.length) {
      return cps(init, metaK(id));
    }
    else {
      return cps(init, buildContinuation(id, cpsDeclarations(declarations, i + 1, metaK)));
    }
  })(declarations[i], fail('expected declarator', declarations[i]));
}

function cpsSequence(nodes, i, k, fk) {
  if (i === nodes.length) {
    return cps(build.identifier('undefined'), k);
  }
  else if (i + 1 === nodes.length) {
    return cpsFinalStatement(nodes[i], k, fk);
  }
  else {
    return cpsInnerStatement(nodes[i], cpsSequence(nodes, i + 1, k, fk), fk);
  }
}

function cpsInnerStatement(node, e, fk) {
  return match(node, [
    clause(Syntax.BlockStatement, function(body) {
      return cpsSequence(body, 0, buildContinuation(genvar('dummy'), e), fk);
    }),
    clause(Syntax.EmptyStatement, function() {
      return e;
    }),
    clause(Syntax.ExpressionStatement, function(expression) {
      return cps(expression, buildContinuation(genvar('dummy'), e));
    }),
    clause(Syntax.IfStatement, function(test, consequent, alternate) {
      if (!alternate) {
        alternate = build.emptyStatement();
      }

      var k = buildContinuation(genvar('dummy'), e);

      return bindContinuation(k, function(k) { // most likely unnecessary
        return atomize(test, function(test) {
          return build.conditionalExpression(test,
                                             cpsFinalStatement(consequent, k, fk),
                                             cpsFinalStatement(alternate, k, fk));
        });
      });
    }),
    clause(Syntax.ReturnStatement, function(argument) {
      return cps(argument, fk);
    }),
    clause(Syntax.VariableDeclaration, function(declarations) {
      return cpsDeclarations(declarations, 0, function(id) {
        return buildContinuation(id, e);
      });
    })], fail('cpsInnerStatement', node));
}

function cpsFinalStatement(node, k, fk) {
  return match(node, [
    clause(Syntax.BlockStatement, function(body) {
      return cpsSequence(body, 0, k, fk);
    }),
    clause(Syntax.EmptyStatement, function() {
      return cps(build.identifier('undefined'), k);
    }),
    clause(Syntax.ExpressionStatement, function(expression) {
      return cps(expression, k);
    }),
    clause(Syntax.IfStatement, function(test, consequent, alternate) {
      if (!alternate) {
        alternate = build.emptyStatement();
      }

      return bindContinuation(k, function(k) { // most likely unnecessary
        return atomize(test, function(test) {
          return build.conditionalExpression(test,
                                             cpsFinalStatement(consequent, k, fk),
                                             cpsFinalStatement(alternate, k, fk));
        });
      });
    }),
    clause(Syntax.ReturnStatement, function(argument) {
      return cps(argument, fk);
    }),
    clause(Syntax.VariableDeclaration, function(declarations) {
      return cpsDeclarations(declarations, 0, function(id) {
        return buildContinuation(id, cps(build.identifier('undefined'), k));
      });
    })], fail('cpsFinalStatement', node));
}

function cpsMain(node) {
  genvar = makeGenvar();

  return inProgram(function(expression) {
    return clause(Syntax.FunctionExpression, function(id, params, body) {
      return cpsFunction(id, params, body);
    })(expression, fail('cps: expected FunctionExpression', expression));
  })(node, fail('cps: inProgram', node));
}

module.exports = {
  cps: cpsMain
};
