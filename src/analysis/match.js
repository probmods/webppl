'use strict';

function clause(destructor, success) {
  return function(value, fail) {
    return destructor(value, success, fail);
  }
}

function match(value, clauses, fail) {
  function loop(i) {
    if (i === clauses.length) {
      return fail();
    }
    else {
      return clauses[i](value, function() {
        return loop(i + 1);
      });
    }
  }

  return loop(0);
}

module.exports = {
  clause: clause,
  match: match
};
