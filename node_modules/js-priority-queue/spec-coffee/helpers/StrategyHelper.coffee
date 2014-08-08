window.StrategyHelper = (->
  numberComparator = (a, b) ->
    throw 'Invalid compare' if !a? || !b?
    a - b

  queueToArray = (queue, nElements) -> queue.dequeue() for i in [ 0 ... nElements ]

  describeStrategy: (description, strategy) ->
    describe description, ->
      priv = undefined

      describe 'with initial values', ->
        beforeEach ->
          priv = new strategy(
            comparator: numberComparator
            initialValues: [ 5, 2, 3, 4, 1, 6, 7 ]
          )

        it 'should dequeue the initial values in order', ->
          expect(queueToArray(priv, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])

      describe 'starting with some elements', ->
        beforeEach ->
          priv = new strategy(comparator: numberComparator)
          priv.queue(3)
          priv.queue(1)
          priv.queue(7)
          priv.queue(2)
          priv.queue(6)
          priv.queue(5)

        describe 'peek', ->
          it 'should see the first element', ->
            expect(priv.peek()).toEqual(1)

          it 'should not remove the first element', ->
            priv.peek()
            expect(priv.peek()).toEqual(1)

        describe 'dequeue', ->
          it 'should dequeue elements in order', ->
            expect(priv.dequeue()).toEqual(1)
            expect(priv.dequeue()).toEqual(2)
            expect(priv.dequeue()).toEqual(3)

        describe 'queue', ->
          it 'should queue at the beginning', ->
            priv.queue(0.5)
            expect(queueToArray(priv, 4)).toEqual([0.5, 1, 2, 3])

          it 'should queue at the middle', ->
            priv.queue(1.5)
            expect(queueToArray(priv, 4)).toEqual([1, 1.5, 2, 3])

          it 'should queue at the end', ->
            priv.queue(3.5)
            expect(queueToArray(priv, 4)).toEqual([1, 2, 3, 3.5])

          it 'should queue a duplicate at the beginning', ->
            priv.queue(1)
            expect(queueToArray(priv, 4)).toEqual([1, 1, 2, 3])

          it 'should queue a duplicate in the middle', ->
            priv.queue(2)
            expect(queueToArray(priv, 4)).toEqual([1, 2, 2, 3])

          it 'should queue a duplicate at the end', ->
            priv.queue(3)
            expect(queueToArray(priv, 4)).toEqual([1, 2, 3, 3])
)()
