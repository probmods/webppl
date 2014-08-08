define = require('amdefine')(module) if !define?
define [ 'PriorityQueue/AbstractPriorityQueue' ], (AbstractPriorityQueue) ->
  numberCompare = (a, b) -> a - b

  describe 'AbstractPriorityQueue', ->
    it 'should throw if there is no strategy', ->
      expect(-> new AbstractPriorityQueue(comparator: numberCompare)).toThrow()

    it 'should throw if there is no comparator', ->
      expect(-> new AbstractPriorityQueue(strategy: (->))).toThrow()

    describe 'with a queue', ->
      queue = undefined
      strategy = undefined

      class MockStrategy
        constructor: (@options) ->
          strategy = this
        queue: ->
        dequeue: ->
        peek: ->

      beforeEach ->
        queue = new AbstractPriorityQueue
          comparator: numberCompare
          strategy: MockStrategy

        it 'should pass the options to the strategy', ->
          expect(strategy.options.comparator).toBe(numberCompare)

        it 'should have length 0', ->
          expect(queue.length).toEqual(0)

        it 'should call strategy.queue', ->
          strategy.queue = jasmine.createSpy()
          queue.queue(3)
          expect(strategy.queue).toHaveBeenCalledWith(3)

        it 'should set length=0 on queue', ->
          queue.queue(3)
          expect(queue.length).toEqual(3)

        it 'should throw when dequeue is called and length is 0', ->
          expect(-> queue.dequeue()).toThrow('Empty queue')

        it 'should call strategy.dequeue', ->
          queue.length = 4
          strategy.dequeue = jasmine.createSpy().andReturn('x')
          value = queue.dequeue()
          expect(strategy.dequeue).toHaveBeenCalled()
          expect(value).toEqual('x')

        it 'should set length when calling dequeue', ->
          queue.length = 3
          queue.dequeue()
          expect(queue.length).toEqual(2)

        it 'should throw when peek is called and length is 0', ->
          expect(-> queue.peek()).toThrow('Empty queue')

        it 'should call strategy.peek', ->
          queue.length = 1
          strategy.peek = jasmine.createSpy().andReturn('x')
          value = queue.peek()
          expect(strategy.peek).toHaveBeenCalled()
          expect(value).toEqual('x')

        it 'should not change length when calling peek', ->
          queue.length = 1
          queue.peek()
          expect(queue.length).toEqual(1)
