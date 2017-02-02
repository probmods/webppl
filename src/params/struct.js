// Operations on the data structure that holds guide parameters or
// gradients.

// The data structure looks like this:

// {
//   name1: [tensor11, tensor12, ...],
//   name2: [tensor21, tensor22, ...],
//   ...
// }

'use strict';

var assert = require('assert');
var _ = require('lodash');


function addEq(g, h) {
  // In-place addition.
  _.each(h, function(hs, a) {
    if (!_.has(g, a)) {
      g[a] = hs;
    } else {
      var gs = g[a];
      assert.strictEqual(gs.length, hs.length);
      for (var i = 0; i < gs.length; i++) {
        gs[i].addeq(hs[i]);
      }
    }
  });
}

function subEq(g, h) {
  // In-place addition.
  _.each(h, function(hs, a) {
    if (!_.has(g, a)) {
      g[a] = hs;
    } else {
      var gs = g[a];
      assert.strictEqual(gs.length, hs.length);
      for (var i = 0; i < gs.length; i++) {
        gs[i].subeq(hs[i]);
      }
    }
  });
}

function mulEq(g, s) {
  // In-place multiplication by a scalar.
  _.each(g, function(gs) {
    for (var i = 0; i < gs.length; i++) {
      gs[i].muleq(s);
    }
  });
}

function divEq(g, s) {
  // In-place division by a scalar.
  _.each(g, function(gs) {
    for (var i = 0; i < gs.length; i++) {
      gs[i].diveq(s);
    }
  });
}

function norm(g) {
  // Compute the L2 norm.
  var normsq = 0;
  _.each(g, function(gs) {
    _.each(gs, function(g) {
      normsq += g.mul(g).sumreduce();
    });
  });
  return Math.sqrt(normsq);
}

function clip(g, threshold, normOfG) {
  assert.ok(_.isNumber(threshold));
  if (normOfG > threshold) {
    mulEq(g, threshold / normOfG);
  }
}

function copy(g) {
  // Shallow copy.
  return _.mapValues(g, function(arr) {
    return arr.slice();
  });
}

function deepCopy(g) {
  return _.mapValues(g, function(arr) {
    return arr.map(function(tensor) { return tensor.clone(); });
  });
}


module.exports = {
  addEq: addEq,
  subEq: subEq,
  mulEq: mulEq,
  divEq: divEq,
  norm: norm,
  clip: clip,
  copy: copy,
  deepCopy: deepCopy
};
