// Operations on the data structure that holds guide parameters or
// gradients.

// The data structure is a dictionary mapping parameter names (string)
// to parameter values (tensor).

'use strict';

var assert = require('assert');
var _ = require('lodash');

function addEq(g, h) {
  // In-place addition.
  _.each(h, function(val, a) {
    if (!_.has(g, a)) {
      g[a] = val;
    } else {
      g[a].addeq(val);
    }
  });
}

function mulEq(g, s) {
  // In-place multiplication by a scalar.
  _.each(g, function(val) {
    val.muleq(s);
  });
}

function divEq(g, s) {
  // In-place division by a scalar.
  _.each(g, function(val) {
    val.diveq(s);
  });
}

function norm(g) {
  // Compute the L2 norm.
  var normsq = 0;
  _.each(g, function(val) {
    normsq += val.mul(val).sumreduce();
  });
  return Math.sqrt(normsq);
}

function clip(g, threshold, normOfG) {
  assert.ok(_.isNumber(threshold));
  if (normOfG > threshold) {
    mulEq(g, threshold / normOfG);
  }
}

function deepCopy(g) {
  return _.mapValues(g, function(val) {
    return val.clone();
  });
}

// Returns a deep copy of g that includes only those keys present in
// h. Assumes that every key in h is also a key in g.
function select(g, h) {
  return _.mapValues(h, function(unused, key) {
    return g[key].clone();
  });
}

module.exports = {
  addEq: addEq,
  mulEq: mulEq,
  divEq: divEq,
  norm: norm,
  clip: clip,
  deepCopy: deepCopy,
  select: select
};
