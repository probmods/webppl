"use strict";

var slicer = Array.prototype.slice
var contains = function(item) { return this.indexOf(item) >= 0 }

function intersection2(a, b) {
  return a.length > b.length ? a.filter(contains, b) :
         b.filter(contains, a)
}

module.exports = function intersection(a, b, rest) {
  /**
  Return a set that is the [intersection][] of the input sets.

      var intersection = require("interset/intersection")

      intersection()
      // => TypeError: intersection requires at least one arguments

      intersection([1])
      // => [1]

      intersection([1, 2], [2, 3])
      // => [2]

      intersection([1, 2], [2, 3], [3, 4])
      // => []

      intersection([1, "a"], ["a", 3], ["a"])
      // => ["a"]
  **/
  if (!a) throw TypeError("intersection requires at least one argument")
  if (!b) return a
  if (!rest) return intersection2(a, b)
  return slicer.call(arguments, 1).reduce(intersection2, a)
}
