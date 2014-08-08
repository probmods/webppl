"use strict";

var union = require("../union")

exports["test empty"] = function(assert) {
  assert.deepEqual(union(), [], "calling union without args return []")
}

exports["test one set"] = function(assert) {
  assert.deepEqual(union([1, 2]), [1, 2],
                   "calling union with one array returns identical array")
}

exports["test union of two sets"] = function(assert) {
  assert.deepEqual(union([1, 2], [3, 4]), [1, 2, 3, 4],
                   "union contains elements from both sets")
  assert.deepEqual(union([1, 2], [2, 3]), [1, 2, 3],
                   "union does not repeats common elements")
}

exports["test union of 2+ sets"] = function(assert) {
  assert.deepEqual(union([1, 2], [2, 3], [3, 4]),
                   [1, 2, 3, 4],
                   "common elements don't repeat")

  assert.deepEqual(union([1, 2, 3],
                         [4, 5, 1],
                         [5],
                         [6, 7, 3, 1],
                         [2, 8, 3],
                         [9, 0]),
                   [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
                   "common elements don't repeat regardless of number of sets")
}
