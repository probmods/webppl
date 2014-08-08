"use strict";

var slicer = Array.prototype.slice
var concater = Array.prototype.concat
var excludes = function excludes(item) { return this.indexOf(item) < 0 }

module.exports = function difference(first, second) {
  /**
  Return a set that is the `first` set without elements of the remaining sets

      var difference = require("interset/difference")

      difference()
      // => TypeError: difference requires at least one arguments

      difference([1, 2, 3])
      // => [1, 2, 3]

      difference([1, 2], [2, 3])
      // => [1]

      difference([1, 2, 3], [1], [1, 4], [3])
      // => [2]
  **/
  if (!first) throw TypeError("difference requires at least one argument")
  if (!second) return first
  var remaining = concater.apply([], slicer.call(arguments, 1))
  return first.filter(excludes, remaining)
}
