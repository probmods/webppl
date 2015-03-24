'use strict';

var assert = require('assert');

var types = require('ast-types').namedTypes;
var build = require('ast-types').builders;

var List = require('immutable').List;
var Map = require('immutable').Map;
var Record = require('immutable').Record;
var Set = require('immutable').Set;

var Syntax = require('estraverse').Syntax;

var parse = require('./parser-combinator');
var analyzeRefs = require('./analyze-refs').analyzeRefs;

var fail = require('../syntaxUtils').fail;

var isHeapVar = null;

var Primitive = new Record({
  type: 'Primitive',
  name: null,
  apply: function(store, environment, args) {
    throw new Error('apply not implemented for ' + this.name);
  },
  sample: function(theta) {
    throw new Error('sample not implemented for ' + this.name);
  }
});

var AValue = new Record({
  values: new Set(),
  states: new Set()
});

function makeGlobal(primitive) {
  return new AValue({
    values: Set.of(primitive),
    states: new Set()
  });
}

var global = new Map({ // FIXME: rename (global is protected name)
  bernoulliERP: makeGlobal(new Primitive({
    name: 'bernoulliERP',
    apply: function(tss) {
      return tss.reduce(function(D, ts) {
        if (ts.get(0) === 1) {
          return D.add(true);
        }
        else if (ts.get(0) === 0) {
          return D.add(false);
        }
        else return Set.of(true, false);
      }, new Set());
    }
  })),
  sample: makeGlobal(new Primitive({
    name: 'sample',
    apply: (function(argument) {
      return function(state, store, environment, dependence, args) {
        var sampler = args.get(0), parameters = args.get(1);

        return sampler.values.map(function(erp) {
          var sample = new AValue({
            values: sampler.values.reduce(function(vs, erp) {
              return vs.union(erp.apply(parameters.values));
            }, new Set()),
            states: dependence.union(sampler.states).union(parameters.states).add(state)
          });

          return new CEvalExit({
            store: store,
            environment: envJoin(environment, argument.name, sample),
            dependence: dependence,
            argument: argument
          });
        });
      }
    })({
      type: 'Identifier',
      name: 'sample-identifier',
      heapRef: false
    })
  }))
});

function Ai(operator, left, right) {
  switch (operator) {
    case '+':
      // XXX abstract values
      return new AValue({
        values: Set.of(12),
        states: left.states.union(right.states)
      });
    default:
      throw new Error('Ai: unhandled operator ' + operator);
  }
}

function Austar(store, environment, dependence, es) {
  function loop(i) {
    if (i == es.length) {
      return new AValue({
        values: Set.of(new List()),
        states: new Set()
      });
    }
    else {
      var v = Au(store, environment, dependence, es[i]), vs = loop(i + 1);

      return new AValue({
        values: v.values.reduce(function(vss, v) {
          return vs.values.reduce(function(vss, vs) {
            return vss.add(vs.unshift(v));
          }, vss);
        }, new Set()),
        states: vs.states.union(v.states)
      });
    }
  }

  return loop(0);
}

function Au(store, environment, dependence, e) {
  switch (e.type) {
    case Syntax.ArrayExpression:
      return Austar(store, environment, dependence, e.elements);
    case Syntax.BinaryExpression:
      return Ai(e.operator, Au(store, environment, dependence, e.left), Au(store, environment, dependence, e.right));
    case Syntax.Identifier:
      var v = null;

      if (e.heapRef) {
        v = store.get(e.name, null) || global.get(e.name, null);
      }
      else {
        v = environment.get(e.name, null);
      }

      if (v) {
        return v;
      }
      else {
        console.log(e);
        throw new Error('not found in environment');
      }
    case Syntax.Literal:
      return new AValue({
        values: Set.of(e.value),
        states: dependence
      });
    default:
      console.log(e);
      throw new Error('unimplemented Au');
  }
}

function envExtend(s, x, v, ss) {
  return s.update(x, new AValue({}), function(D) {
    return new AValue({
      values: D.values.add(v),
      states: D.states.union(ss)
    });
  });
}

function envJoin(s, x, D) {
  return s.update(x, new AValue({}), function(D0) {
    return new AValue({
      values: D0.values.union(D.values),
      states: D0.states.union(D.states)
    });
  });
}

function mapExtend(s, x, v) {
  return s.update(x, new Set(), function(D) {
    return D.add(v);
  });
}

function mapJoin(s, x, D) {
  return s.update(x, new Set(), function(D0) {
    return D0.union(D);
  });
}

function callSiteLabel(node) {
  return node.arguments[1].arguments[0].value;
}

function makeCallb(destructor) {
  return function(f) {
    return function(node, succeed, fail) {
      return destructor(node, function() {
        return succeed(f.apply(this, arguments));
      }, fail);
    }
  }
}

function destructFuncExp(node, succeed, fail) {
  if (types.FunctionExpression.check(node)) {
    if (isContinuationFunc(node)) {
      return succeed(contParams(node), node.body);
    }
    else {
      return succeed(funcParams(node), node.body);
    }
  }
  else return fail();
}

function destructCondExp(node, succeed, fail) {
  if (types.ExpressionStatement.check(node) &&
      types.ConditionalExpression.check(node.expression)) {
    return succeed(node.expression.test, node.expression.consequent, node.expression.alternate);
  }
  else return fail();
}

var callbCondExp = makeCallb(destructCondExp);

function destructContCall(node, succeed, fail) {
  if (types.ExpressionStatement.check(node) &&
      types.CallExpression.check(node.expression) &&
      isContinuationCall(node.expression)) {
    return succeed(node.expression.callee, node.expression.arguments[0]);
  }
  else return fail();
}

var callbContCall = makeCallb(destructContCall);

function destructUserCall(node, succeed, fail) {
  if (types.ExpressionStatement.check(node) &&
      types.CallExpression.check(node.expression) &&
      (! isContinuationCall(node.expression))) {
    return succeed(callSiteLabel(node.expression),
                   node.expression.callee,
                   node.expression.arguments.slice(2),
                   node.expression.arguments[0]);
  }
  else return fail();
}

var callbUserCall = makeCallb(destructUserCall);

// ---

function accessor(name) {
  return function(x) {
    return x[name];
  }
}

function contParams(node) {
  return node.params.map(accessor('name'));
}

function funcParams(node) {
  return node.params.slice(2).map(accessor('name'));
}

function isContinuationFunc(f) {
  return f.params.length === 1;
}

function isContinuationCall(call) {
  return call.arguments.length === 1;
}

// ---

function parseBEval(store, environment, dependence) {
  return parse.bind(parse.single(parseCondExp(store, environment, dependence)), parse.finish);
}

function parseCondExp(store, environment, dependence) {
  return callbCondExp(function(test, consequent, alternate) {
    return makeBEval(store, environment, dependence, test, consequent, alternate);
  });
}

function makeBEval(store, environment, dependence, test, consequent, alternate) {
  return new BEval({
    store: store,
    environment: environment,
    dependence: dependence,
    test: test,
    consequent: consequent,
    alternate: alternate
  });
}

// ---

function parseCEval(store, environment, dependence) {
  return parse.bind(parse.single(parseContCall(store, environment, dependence)), parse.finish);
}

function parseContCall(store, environment, dependence) {
  return callbContCall(function(cont, argument) {
    return makeCEval(store, environment, dependence, cont, argument);
  });
}

function makeCEval(store, environment, dependence, cont, argument) {
  if (types.Identifier.check(cont)) {
    return new CEvalExit({
      store: store,
      environment: environment,
      dependence: dependence,
      argument: argument
    });
  }
  else {
    return new CEvalInner({
      store: store,
      environment: environment,
      dependence: dependence,
      cont: cont,
      argument: argument
    });
  }
}

// ---

function parseUEval(store, environment, dependence) {
  return parse.bind(parse.single(parseUserCall(store, environment, dependence)), parse.finish);
}

function parseUserCall(store, environment, dependence) {
  return callbUserCall(function(label, callee, args, k) {
    return makeUEval(store, environment, dependence, label, callee, args, k);
  });
}

function makeUEval(store, environment, dependence, label, callee, args, k) {
  if (types.Identifier.check(k)) {
    return new UEvalExit({
      store: store,
      environment: environment,
      dependence: dependence,
      label: label,
      callee: callee,
      args: args
    });
  }
  else {
    return new UEvalCall({
      store: store,
      environment: environment,
      dependence: dependence,
      label: label,
      callee: callee,
      args: args,
      k: k
    });
  }
}

// ---

var BEval = new Record({
  type: 'BEval',
  store: null,
  environment: null,
  dependence: null,
  test: null,
  consequent: null,
  alternate: null
});

function parse_single_or(p, q) {
  return function(node, succeed, fail) {
    return p(node, succeed, function() {
      return q(node, succeed, fail);
    });
  }
}

BEval.prototype.succs = function() {
  var vs = Au(this.store, this.environment, this.dependence, this.test);

  var states = new Set(), add = function(state) {
    states = states.add(state);
  };

  if (vs.states.size > 1) {
    console.log('checking equality');
    check_equal(vs.states.first(), vs.states.rest().first());
  }

  var parse = parse_single_or(parseContCall(this.store, this.environment, this.dependence.union(vs.states)),
                              parseUserCall(this.store, this.environment, this.dependence.union(vs.states)));

  if (vs.values.has(true)) {
    parse(build.expressionStatement(this.consequent), add, fail('not a call', this.consequent));
  }

  if (vs.values.has(false)) {
    parse(build.expressionStatement(this.alternate), add, fail('not a call', this.alternate));
  }

  return states;
};

var CEvalExit = new Record({
  type: 'CEvalExit',
  store: null,
  environment: null,
  dependence: null,
  argument: null
});

CEvalExit.prototype.succs = function() {
  return new Set();
};

CEvalExit.prototype.evaluatedArgument = function() {
  return Au(this.store, this.environment, this.dependence, this.argument);
};


var CEvalInner = new Record({
  type: 'CEvalInner',
  store: null,
  environment: null,
  dependence: null,
  cont: null,
  argument: null
});

CEvalInner.prototype.succs = function() {
  var argument = Au(this.store, this.environment, this.dependence, this.argument);

  return Set.of(new CApply({
    store: this.store,
    environment: this.environment,
    dependence: this.dependence,
    cont: this.cont,
    argument: argument
  }));
};

var CApply = new Record({
  type: 'CApply',
  store: null,
  environment: null,
  dependence: null,
  cont: null,
  argument: null
});

CApply.prototype.succs = function() {
  var store = this.store, environment = this.environment,
      dependence = this.dependence, argument = this.argument;

  return Set.of(destructFuncExp(this.cont, function(params, body) {
    environment = envJoin(environment, params[0], argument);

    if (isHeapVar(params[0])) {
      store = envJoin(store, params[0], argument);
    }

    return parseBody(store, environment, dependence, body.body);
  }, fail('expected a function expression', this.cont)));
};

function UEval_succs() {
  var store = this.store, environment = this.environment, dependence = this.dependence;

  var Df = Au(store, environment, dependence, this.callee);

  var Dargs = List.of.apply(List, this.args).map(function(x) {
    return Au(store, environment, dependence, x);
  });

  var self = this;

  return Df.values.reduce(function(ss, f) {
    switch (f.type) {
      case 'Primitive':
        return ss.union(f.apply(self, store, environment, dependence, Dargs));
      default:
        return ss.add(new UApplyEntry({
          store: store,
          f: f,
          args: Dargs
        }));
    }
  }, new Set());
}

var UEvalCall = new Record({
  type: 'UEvalCall',
  store: null,
  environment: null,
  dependence: null,
  label: null,
  callee: null,
  args: null,
  k: null
});

UEvalCall.prototype.succs = UEval_succs;

var UEvalExit = new Record({
  type: 'UEvalExit',
  store: null,
  environment: null,
  dependence: null,
  label: null,
  callee: null,
  args: null
});

UEvalExit.prototype.succs = UEval_succs;

var UApplyEntry = new Record({
  type: 'UApplyEntry',
  store: null,
  f: null,
  args: null
});

UApplyEntry.prototype.succs = function() {
  var store = this.store, args = this.args;

  return Set.of(destructFuncExp(this.f, function(params, body) {
    var environment = new Map(), dependence = new Set();

    for (var i = 0; i < params.length; ++i) {
      environment = envJoin(environment, params[i], args.get(i));

      if (isHeapVar(params[i])) {
        store = envJoin(store, params[i], args.get(i));
      }
    }

    return parseBody(store, environment, dependence, body.body);
  }, fail('expected a function expression', this.f)));
};

function id(x) {
  return x;
}

function parseDeclaration(node, succeed, fail) {
  if (types.VariableDeclaration.check(node) &&
      node.declarations.length === 1) {
    return succeed(node.declarations[0]);
  }
  else return fail();
}

function parseBody(store, environment, dependence, nodes) {
  return parse.bind(parse.apply(parse.rep(parse.single(parseDeclaration)), function(declarations) {
    declarations.forEach(function(declaration) {
      environment = envExtend(environment, declaration.id.name, declaration.init, dependence);

      if (isHeapVar(declaration.id.name)) {
        store = envExtend(store, declaration.id.name, declaration.init, dependence);
      }
    });
  }), function(ignore) {
    return parse.or([parseBEval(store, environment, dependence),
                     parseCEval(store, environment, dependence),
                     parseUEval(store, environment, dependence)]);
  })(nodes, 0, id, fail('parseBody: failed', nodes));
}

function inject(node) {
  assert(types.Program.check(node));
  assert(node.body.length === 1);
  assert(types.ExpressionStatement.check(node.body[0]));

  return new UApplyEntry({
    store: new Map(),
    f: node.body[0].expression,
    args: new List()
  });
}

// expects an AST of a named, CPS'd program
function analyzeMain(node) {
  var Pair = new Record({
    car: null,
    cdr: null,
    toString: function() {
      return '(' + this.car + ',' + this.cdr + ')';
    }
  });

  isHeapVar = analyzeRefs(node);

  var seen = new Set(), work = new Set(), summaries = new Map(),
      callers = new Map(), tcallers = new Map(), finals = new Set();

  //var pred = new Map();
  var succ = new Map();

  function trace(state) {
    var t = new List();

    var s = succ.get(state);

    var p = tcallers.get(s).first();

    t = t.unshift(p.cdr.label);
    s = p.car;


    return t;
  }

  function successor(s0, s1) { // first successor, really only meaningful if there's only one
    if (! succ.has(s0)) {
      succ = succ.set(s0, s1);
    }
  }

  function propagate(s0, s1) {
    var ss = new Pair({
      car: s0,
      cdr: s1
    });

    if (! seen.has(ss)) {
      seen = seen.add(ss);
      work = work.add(ss);
    }
  }

  function update(s1, s2, s3, s4) {
    assert(s1.type === 'UApplyEntry');
    assert(s2.type === 'UEvalCall');
    assert(s3.type === 'UApplyEntry');
    assert(s4.type === 'CEvalExit');

    var f_dependence = Au(s2.store, s2.environment, s2.dependence, s2.callee).states;

    var environment = s2.environment;

    if (types.Identifier.check(s2.callee) && (! s2.callee.heapRef)) {
      environment = envExtend(environment, s2.callee.name, s3.f, f_dependence);
    }

    var argument = s4.evaluatedArgument();

    propagate(s1, new CApply({
      store: s4.store,
      environment: environment,
      dependence: s2.dependence, // XXX check this
      cont: s2.k,
      argument: new AValue({
        values: argument.values,
        states: argument.states.union(f_dependence)
      })
    }));
  }

  var init = inject(node);

  propagate(init, init);

  while (work.size > 0) {
    var states = work.first();

    work = work.rest();

    if (states.cdr instanceof CEvalExit) {
      if (states.car.equals(init)) {
        finals = finals.add(states.cdr.evaluatedArgument());
      }
      else {
        summaries = mapExtend(summaries, states.car, states.cdr);

        callers.get(states.car, new Set()).forEach(function(s0ands1) {
          update(s0ands1.car, s0ands1.cdr, states.car, states.cdr);
        });

        tcallers.get(states.car, new Set()).forEach(function(s0ands1) {
          propagate(s0ands1.car, new CEvalExit({
            store: states.cdr.store,
            environment: states.cdr.environment,
            dependence: states.cdr.dependence.union(s0ands1.cdr.dependence),
            argument: states.cdr.argument
          }));
        });
      }
    }
    else if (states.cdr instanceof UEvalCall) {
      states.cdr.succs().forEach(function(state) {
        propagate(state, state);
        successor(states.cdr, state);

        callers = mapExtend(callers, state, states);

        summaries.get(state, new Set()).forEach(function(state1) {
          update(states.car, states.cdr, state, state1);
        });
      });
    }
    else if (states.cdr instanceof UEvalExit) {
      states.cdr.succs().forEach(function(state) {
        propagate(state, state);
        successor(states.cdr, state);

        tcallers = mapExtend(tcallers, state, states);

        summaries.get(state, new Set()).forEach(function(state) {
          propagate(states.car, state);
        });
      });
    }
    else if (states.cdr instanceof UApplyEntry ||
             states.cdr instanceof CApply ||
             states.cdr instanceof CEvalInner ||
             states.cdr instanceof BEval) {
      states.cdr.succs().forEach(function(state) {
        propagate(states.car, state);
        successor(states.cdr, state);
      });
    }
    else {
      throw new Error('unhandled state with type ' + states.cdr.type);
    }
  }

  return finals;
}

module.exports = {
  analyze: analyzeMain
};
