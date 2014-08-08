define = require('amdefine')(module) if !define?
define [ 'PriorityQueue' ], (PriorityQueue) ->
  numberCompare = (a, b) -> a - b

  describe 'PriorityQueue', ->
    it 'should have a BHeapStrategy', ->
      expect(PriorityQueue.BHeapStrategy).toBeDefined()

    it 'should have a BinaryHeapStrategy', ->
      expect(PriorityQueue.BinaryHeapStrategy).toBeDefined()

    it 'should have an ArrayStrategy', ->
      expect(PriorityQueue.ArrayStrategy).toBeDefined()

    it 'should default to BinaryHeapStrategy', ->
      queue = new PriorityQueue(comparator: numberCompare)
      expect(queue.priv.constructor).toBe(PriorityQueue.BinaryHeapStrategy)

    it 'should queue a default comparator', ->
      queue = new PriorityQueue(strategy: PriorityQueue.BinaryHeapStrategy)
      expect(queue.priv.comparator(2, 3)).toEqual(-1)

  describe 'integration tests', ->
    queue = undefined

    beforeEach -> queue = new PriorityQueue()

    it 'should stay sorted', ->
      queue.queue(1)
      queue.queue(3)
      queue.queue(2)

      expect(queue.dequeue()).toEqual(1)
      expect(queue.dequeue()).toEqual(2)
      expect(queue.dequeue()).toEqual(3)
