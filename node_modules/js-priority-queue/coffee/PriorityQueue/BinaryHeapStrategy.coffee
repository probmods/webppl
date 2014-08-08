define = require('amdefine')(module) if !define?
define ->
  class BinaryHeapStrategy
    constructor: (options) ->
      @comparator = options?.comparator || (a, b) -> a - b
      @length = 0
      @data = (options.initialValues?.slice(0) || [])
      @_heapify()

    _heapify: ->
      if @data.length > 0
        for i in [ 1 ... @data.length ]
          @_bubbleUp(i)
      undefined

    queue: (value) ->
      @data.push(value)
      @_bubbleUp(@data.length - 1)
      undefined

    dequeue: ->
      ret = @data[0]
      last = @data.pop()
      if @data.length > 0
        @data[0] = last
        @_bubbleDown(0)
      ret

    peek: ->
      @data[0]

    _bubbleUp: (pos) ->
      while pos > 0
        parent = (pos - 1) >>> 1
        if @comparator(@data[pos], @data[parent]) < 0
          x = @data[parent]; @data[parent] = @data[pos]; @data[pos] = x
          pos = parent
        else
          break
      undefined

    _bubbleDown: (pos) ->
      last = @data.length - 1

      loop
        left = (pos << 1) + 1
        right = left + 1
        minIndex = pos
        if left <= last && @comparator(@data[left], @data[minIndex]) < 0
          minIndex = left
        if right <= last && @comparator(@data[right], @data[minIndex]) < 0
          minIndex = right

        if minIndex != pos
          x = @data[minIndex]; @data[minIndex] = @data[pos]; @data[pos] = x
          pos = minIndex
        else
          break
      undefined
