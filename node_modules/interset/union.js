"use strict";
var slicer = Array.prototype.slice

function add(union, item) {
  if (union.indexOf(item) < 0) union.push(item)
  return union
}

function include(union, set) {
  return set.reduce(add, union)
}

module.exports = function union(a, b) {
  /**
  Return a set that is the [union][] of the input sets.

      var union = require("interset/union")

      union()
      // => []

      union([1, 2])
      // => [1, 2]

      union([1, 2], [2, 3])
      // => [1, 2, 3]

      union([1, 2], [2, 3], [3, 4])
      // => [1, 2, 3, 4]
  **/
  if (!a) return []
  if (!b) return a
  return slicer.call(arguments).reduce(include, [])
}
