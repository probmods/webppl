// Operations on the data structure that holds guide parameter
// gradients.

// The data structure looks like this:

// {
//   name1: [grad11, grad12, ...],
//   name2: [grad21, grad22, ...],
//   ...
// }

var assert = require('assert');
var _ = require('underscore');

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
    assert.ok(Math.abs(threshold - norm(g)) < 1e-10);
  }
}

function copy(g) {
  // Shallow copy.
  return _.mapObject(g, function(arr) {
    return arr.slice();
  });
}

function deepCopy(g) {
  return _.mapObject(g, function(arr) {
    return arr.map(function(tensor) { return tensor.clone(); });
  });
}

module.exports = {
  addEq: addEq,
  mulEq: mulEq,
  divEq: divEq,
  norm: norm,
  clip: clip,
  copy: copy,
  deepCopy: deepCopy
};
