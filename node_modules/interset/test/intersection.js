"use strict";

var intersection = require("../intersection")

exports["test no args"] = function(assert) {
  assert.throws(function() {
    intersection()
  }, "calling intersection without args throws")
}

exports["test one set"] = function(assert) {
  assert.deepEqual(intersection([1, 2]), [1, 2],
                   "calling intersection with one set returns identical")
}

exports["test intersection of two sets"] = function(assert) {
  assert.deepEqual(intersection([1, 2], [3, 4]), [],
                   "intersection is empty if no common items found")
  assert.deepEqual(intersection([1, 2], [2, 3]), [2],
                   "intersection returns only common items")
}

exports["test intersection of 2+ sets"] = function(assert) {
  assert.deepEqual(intersection([1, 2], [2, 3], [3, 4]),
                   [],
                   "intersection is empty if there are no common elements")

  assert.deepEqual(intersection([1, 2, 3, 4, 5, 7],
                         [4, 5, 1, 9, 0, 7],
                         [1, 5, 7],
                         [6, 7, 3, 1],
                         [2, 8, 7, 1, 3],
                         [7, 8, 9, 0, 1]).sort(),
                   [1, 7].sort(),
                   "contains only common items of all sets")
}
