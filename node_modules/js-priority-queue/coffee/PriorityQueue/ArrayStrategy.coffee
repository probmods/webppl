define = require('amdefine')(module) if !define?
define ->
  binarySearchForIndexReversed = (array, value, comparator) ->
    low = 0
    high = array.length
    while low < high
      mid = (low + high) >>> 1
      if comparator(array[mid], value) >= 0 # >=, instead of the usual <
        low = mid + 1
      else
        high = mid
    low

  # Maintains a sorted Array. The running-time is bad in theory, but in
  # practice Array operations are small ... assuming there isn't much data.
  #
  # The Array is stored from last entry to first: we assume queue() will be
  # the same speed either way, but this way dequeue() is O(1) instead of O(n).
  class ArrayStrategy
    constructor: (@options) ->
      @comparator = @options.comparator
      @data = (@options.initialValues?.slice(0) || [])
      @data.sort(@comparator).reverse()

    queue: (value) ->
      pos = binarySearchForIndexReversed(@data, value, @comparator)
      @data.splice(pos, 0, value)
      undefined

    dequeue: ->
      @data.pop()

    peek: ->
      @data[@data.length - 1]
