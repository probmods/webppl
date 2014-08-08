define = require('amdefine')(module) if !define?
define [
  './PriorityQueue/AbstractPriorityQueue'
  './PriorityQueue/ArrayStrategy'
  './PriorityQueue/BinaryHeapStrategy'
  './PriorityQueue/BHeapStrategy'
], (
  AbstractPriorityQueue
  ArrayStrategy,
  BinaryHeapStrategy,
  BHeapStrategy
) ->
  class PriorityQueue extends AbstractPriorityQueue
    constructor: (options) ->
      options ||= {}
      options.strategy ||= BinaryHeapStrategy
      options.comparator ||= (a, b) -> (a || 0) - (b || 0)
      super(options)

  PriorityQueue.ArrayStrategy = ArrayStrategy
  PriorityQueue.BinaryHeapStrategy = BinaryHeapStrategy
  PriorityQueue.BHeapStrategy = BHeapStrategy

  PriorityQueue
