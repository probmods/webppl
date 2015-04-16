'use strict';
var Record = require('immutable').Record;
var Set = require('immutable').Set;


function id(ss01) {
  return 's' + Math.abs(ss01.hashCode()).toString(16);
}

function desc_funexp(f) {
  return '(lambda (' + f.params.slice(2).join(' ') + ') ...)';
}

function desc_aexp(e) {
  switch (e.type) {
    case 'FunctionExpression':
      return desc_funexp(e);
    case 'Identifier':
      return e.name;
    case 'Literal':
      return e.raw;
    default:
      return '??';
  }
}

function desc_fun(f) {
  if (f instanceof Function) {
    return f.name;
  }
  else if (f.id) {
    return f.id.name;
  }
  else {
    return desc_funexp(f);
  }
}

function desc_val(v) {
  if (v instanceof Number) {
    return v.toString();
  }
  else if (v instanceof Record) {
    return '<' + v.type + '>';
  }
  else if (v instanceof Set) {
    if (v.size === 1) {
      return desc_val(v.first());
    }
    else if (v.equals(Set.of(true, false))) {
      return '<bool>';
    }
    else return 'Set<?>';
  }
  else return v.toString();
  //else return "Val<" + v.constructor + ">";
}

function desc(s) {
  switch (s.type) {
    case 'Entr':
      return desc_fun(s.fun) + '(' + s.args.toArray().map(desc_val) + ')';
    case 'Call':
      return desc_aexp(s.f) + '(' + s.es.map(desc_aexp).join(',') + ')';
    case 'Exit':
      return desc_val(s.value);
    default:
      return s.type;
  }
}

function node(ss01) {
  return '  ' + id(ss01) + ' [label=\"' + desc(ss01.cdr) + '\"]\n'
}

function internal_edge(ss01, ss02) {
  return '  ' + id(ss01) + ' -> ' + id(ss02) + ' [style=dotted]\n';
}

function call_retr_edge(ss01, ss23) {
  if (ss01.cdr.label) {
    return '  ' + id(ss01) + ' -> ' + id(ss23) + ' [label=\"call' + ss01.cdr.label + '\"]\n';
  }
  else {
    return '  ' + id(ss01) + ' -> ' + id(ss23) + ' [label=\"return\"]\n';
  }
}

function vizualize(analysis, os) {
  os.write('digraph cfg {\n');

  analysis.seen.forEach(function(ss01) {
    os.write(node(ss01));
  });

  analysis.preds.forEach(function(ss01, ss02) {
    os.write(internal_edge(ss01, ss02));
  });

  analysis.calls.forEach(function(ss01s, ss22) {
    ss01s.forEach(function(ss01) {
      os.write(call_retr_edge(ss01, ss22));
    });
  });

  analysis.retrs.forEach(function(ss12s, ss02) {
    ss12s.forEach(function(ss12) {
      os.write(call_retr_edge(ss12, ss02));
    });
  });

  os.write('}\n');
}

exports.vizualize = vizualize;
