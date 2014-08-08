# B-Heap implementation. It's like a binary heap, but with fewer page faults.
#
# This is transcribed from http://phk.freebsd.dk/B-Heap/binheap.c. We use
# "algo 3", as the others are proven slower.
#
# Why a B-Heap and not a binary heap? A B-Heap improves memory locality. Since
# we often deal with subtrees, we want the data in subtrees to be close
# together. A binary tree is terrible at this.
define = require('amdefine')(module) if !define?
define ->
  class BHeapStrategy
    constructor: (options) ->
      @comparator = options?.comparator || (a, b) -> a - b
      @pageSize = options?.pageSize || 512
      @length = 0

      shift = 0
      while (1 << shift) < @pageSize
        shift += 1
      throw 'pageSize must be a power of two' if 1 << shift != @pageSize
      @_shift = shift

      @_emptyMemoryPageTemplate = arr = []
      arr.push(null) for i in [ 0 ... @pageSize ]

      @_memory = [] # Array of pages; each page is an Array
      @_mask = @pageSize - 1 # for & ops

      if options.initialValues
        @queue(value) for value in options.initialValues

    queue: (value) ->
      @length += 1
      @_write(@length, value)
      @_bubbleUp(@length, value)
      undefined

    dequeue: ->
      ret = @_read(1)
      val = @_read(@length)
      @length -= 1
      if @length > 0
        @_write(1, val)
        @_bubbleDown(1, val)
      ret

    peek: ->
      @_read(1)

    _write: (index, value) ->
      page = index >> @_shift
      while page >= @_memory.length # we want page < @_memory.length
        @_memory.push(@_emptyMemoryPageTemplate.slice(0))
      @_memory[page][index & @_mask] = value

    _read: (index) ->
      @_memory[index >> @_shift][index & @_mask]

    _bubbleUp: (index, value) ->
      compare = @comparator

      while index > 1
        indexInPage = index & @_mask
        if index < @pageSize || indexInPage > 3
          parentIndex = (index & ~@_mask) | (indexInPage >> 1)
        else if indexInPage < 2
          parentIndex = (index - @pageSize) >> @_shift
          parentIndex += (parentIndex & ~(@_mask >> 1))
          parentIndex |= (@pageSize >> 1)
        else
          parentIndex = index - 2

        parentValue = @_read(parentIndex)
        if compare(parentValue, value) < 0
          break
        @_write(parentIndex, value)
        @_write(index, parentValue)
        index = parentIndex

      undefined

    _bubbleDown: (index, value) ->
      compare = @comparator

      while index < @length
        if index > @_mask && !(index & (@_mask - 1))
          # First two elements in nonzero pages
          childIndex1 = childIndex2 = index + 2 # Yup, the same (see later)
        else if index & (@pageSize >> 1)
          # last row of a page
          childIndex1 = (index & ~@_mask) >> 1
          childIndex1 |= index & (@_mask >> 1)
          childIndex1 = (childIndex1 + 1) << @_shift
          childIndex2 = childIndex1 + 1
        else
          childIndex1 = index + (index & @_mask)
          childIndex2 = childIndex1 + 1

        if childIndex1 != childIndex2 && childIndex2 <= @length
          childValue1 = @_read(childIndex1)
          childValue2 = @_read(childIndex2)
          if compare(childValue1, value) < 0 && compare(childValue1, childValue2) <= 0
            @_write(childIndex1, value)
            @_write(index, childValue1)
            index = childIndex1
          else if compare(childValue2, value) < 0
            @_write(childIndex2, value)
            @_write(index, childValue2)
            index = childIndex2
          else
            break
        else if childIndex1 <= @length
          childValue1 = @_read(childIndex1)
          if compare(childValue1, value) < 0
            @_write(childIndex1, value)
            @_write(index, childValue1)
            index = childIndex1
          else
            break
        else
          break

      undefined
