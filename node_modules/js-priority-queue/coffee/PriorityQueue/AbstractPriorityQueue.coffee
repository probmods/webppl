define = require('amdefine')(module) if !define?
define ->
  class AbstractPriorityQueue
    constructor: (options) ->
      throw 'Must pass options.strategy, a strategy' if !options?.strategy?
      throw 'Must pass options.comparator, a comparator' if !options?.comparator?
      @priv = new options.strategy(options)
      @length = 0

    queue: (value) ->
      @length++
      @priv.queue(value)
      undefined

    dequeue: (value) ->
      throw 'Empty queue' if !@length
      @length--
      @priv.dequeue()

    peek: (value) ->
      throw 'Empty queue' if !@length
      @priv.peek()
