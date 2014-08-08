"use strict";

var difference = require("../difference")

exports["test empty"] = function(assert) {
  assert.throws(function() {
    difference()
  }, "calling difference without args throws")
}

exports["test difference on single set"] = function(assert) {
  assert.deepEqual(difference([1, 2]), [1, 2],
                   "difference between set nothing is a same set")
}

exports["test difference of two sets"] = function(assert) {
  assert.deepEqual(difference([1, 2], [3, 4]), [1, 2],
                   "difference between non overlaping a and b is a")
  assert.deepEqual(difference([1, 2], [2, 3]), [1],
                   "difference excludes items from 1st set if contained by 2nd")
}

exports["test difference of 2+ sets"] = function(assert) {
  assert.deepEqual(difference([1, 2, 3, 4, 5, 6],
                              [2, 4, 7],
                              [3, 4],
                              [4, 5],
                              [5]),
                   [1, 6],
                   "repeating elements are excluded from 1st")


  assert.deepEqual(difference([1, 2, 3, 4, 5, 6],
                              [8, 9, 0],
                              [7, 0],
                              [11, 15],
                              [9]),
                   [1, 2, 3, 4, 5, 6],
                   "result is identical of 1st set if items don't repeat")
}
