Arrays
======

.. js:function:: map(fn, arr)

   Returns an array obtained by mapping the function ``fn`` over array
   ``arr``.

   ::

      map(function(x) { return x + 1; }, [0, 1, 2]); // => [1, 2, 3]

.. js:function:: mapData({data: arr[, batchSize: n]}, fn)

   Returns an array obtained by mapping the function ``fn`` over array
   ``arr``. Each application of ``fn`` has an element of ``arr`` as
   its first argument and the index of that element as its second
   argument.

   ``map`` and ``mapData`` differ in that the use of ``mapData``
   asserts to the inference back end that all executions of ``fn`` are
   conditionally independent. This information can potentially be
   exploited on a per algorithm basis to improve the efficiency of
   inference.

   ``mapData`` also provides an interface through which inference
   algorithms can support data sub-sampling. Where supported, the size
   of a "mini-batch" can be specified using the ``batchSize`` option.
   When using data sub-sampling the array normally returned by
   ``mapData`` is not computed in its entirety, so ``undefined`` is
   returned in its place.

   Only the :ref:`ELBO <elbo>` optimization objective takes advantage
   of ``mapData`` at this time.

   ::

      mapData({data: [0, 1, 2]}, function(x) { return x + 1; }); // => [1, 2, 3]
      mapData({data: data, batchSize: 10}, fn);

.. js:function:: map2(fn, arr1, arr2)

   Returns an array obtained by mapping the function ``fn`` over
   arrays ``arr1`` and ``arr2`` concurrently. Each application of
   ``fn`` has an element of ``arr1`` as its first argument and the
   element with the same index in ``arr2`` as its second argument.

   It is assumed that ``arr1`` and ``arr2`` are arrays of the same
   length. When this is not the case the behavior of ``map2`` is
   undefined.

   ::

      var concat = function(x, y) { return x + y; };
      map2(concat, ['a', 'b'], ['1', '2']); // => ['a1', 'b2']

.. js:function:: mapN(fn, n)

   Returns an array obtained by mapping the function ``fn`` over the
   integers ``[0,1,...,n-1]``.

   ::

      var inc = function(x) { return x + 1; };
      mapN(inc, 3); // => [1, 2, 3]

.. js:function:: mapIndexed(fn, arr)

   Returns the array obtained by mapping the function ``fn`` over
   array ``arr``. Each application of ``fn`` has the index of the
   current element as its first argument and the element itself as its
   second argument.

   ::

      var pair = function(x, y) { return [x, y]; };
      mapIndexed(pair, ['a', 'b']); // => [[0, 'a'], [1, 'b']]

.. js:function:: reduce(fn, init, arr)

   Reduces array ``arr`` to a single value by applying function ``fn``
   to an accumulator and each value of the array. ``init`` is the
   initial value of the accumulator.

   ::

      reduce(function(x, acc) { return x + acc; }, 0, [1, 2, 3]); // => 6

.. js:function:: sum(arr)

   Computes the sum of the elements of array ``arr``.

   It is assumed that each element of ``arr`` is a number.

   ::

      sum([1, 2, 3, 4]) // => 10

.. js:function:: product(arr)

   Computes the product of the elements of array ``arr``.

   It is assumed that each element of ``arr`` is a number.

   ::

      product([1, 2, 3, 4]) // => 24

.. js:function:: listMean(arr)

   Computes the mean of the elements of array ``arr``.

   It is assumed that ``arr`` is not empty, and that each element is a
   number.

   ::

      listMean([1, 2, 3]); // => 2

.. js:function:: listVar(arr[, mean])

   Computes the variance of the elements of array ``arr``.

   The ``mean`` argument is optional. When supplied it is expected to
   be the mean of ``arr`` and is used to avoid recomputing the mean
   internally.

   It is assumed that ``arr`` is not empty, and that each element is a
   number.

   ::

      listVar([1, 2, 3]); // => 0.6666...

.. js:function:: listStdev(arr[, mean])

   Computes the standard deviation of the elements of array ``arr``.

   The ``mean`` argument is optional. When supplied it is expected to
   be the mean of ``arr`` and is used to avoid recomputing the mean
   internally.

   It is assumed that ``arr`` is not empty, and that each element is a
   number.

   ::

      listStdev([1, 2, 3]); // => 0.8164...

.. js:function:: all(predicate, arr)

   Returns ``true`` when all of the elements of array ``arr`` satisfy
   ``predicate``, and ``false`` otherwise.

   ::

      all(function(x) { return x > 1; }, [1, 2, 3]) // => false

.. js:function:: any(predicate, arr)

   Returns ``true`` when any of the elements of array ``arr`` satisfy
   ``predicate``, and ``false`` otherwise.

   ::

      any(function(x) { return x > 1; }, [1, 2, 3]) // => true

.. js:function:: zip(arr1, arr2)

   Combines two arrays into an array of pairs. Each pair is
   represented as an array of length two.

   It is assumed that ``arr1`` and ``arr2`` are arrays of the same
   length. When this is not the case the behavior of ``zip`` is
   undefined.

   ::

      zip(['a', 'b'], [1, 2]); // => [['a', 1], ['b', 2]]

.. js:function:: filter(predicate, arr)

   Returns a new array containing only those elements of array ``arr``
   that satisfy ``predicate``.

   ::

      filter(function(x) { return x > 1; }, [0, 1, 2, 3]); // => [2, 3]

.. js:function:: find(predicate, arr)

   Returns the first element of array ``arr`` that satisfies
   ``predicate``. When no such element exists ``undefined`` is
   returned.

   ::

      find(function(x) { return x > 1; }, [0, 1, 2]); // => 2

.. js:function:: remove(element, arr)

   Returns a new array obtained by filtering out of array ``arr``
   elements not equal to ``element``.

   ::

      remove(0, [0, -1, 0, 2, 1]); // => [-1, 2, 1]

.. js:function:: groupBy(eqv, arr)

   Splits an array into sub-arrays based on pairwise equality checks
   performed by the function ``eqv``.

   ::

      var sameLength = function(x, y) { return x.length === y.length; };
      groupBy(sameLength, ['a', 'ab', '', 'bc']); // => [['a'], ['ab', 'bc'], ['']]

.. js:function:: repeat(n, fn)

   Returns an array of length ``n`` where each element is the result
   of applying ``fn`` to zero arguments.

   ::

      repeat(3, function() { return true; }); // => [true, true, true]

.. js:function:: sort(arr[, predicate[, fn]])

   Returns a sorted array.

   Elements are compared using ``<`` by default. This is equivalent to
   passing ``lt`` as the ``predicate`` argument. To sort by ``>`` pass
   ``gt`` as the ``predicate`` argument.

   To sort based on comparisons between a function of each element,
   pass a function as the ``fn`` argument.

   ::

      sort([3,2,4,1]); // => [1, 2, 3, 4]
      sort([3,2,4,1], gt); // => [4, 3, 2, 1]

      var length = function(x) { return x.length; };
      sort(['a', 'ab', ''], lt, length); // => ['', 'a', 'ab']

.. js:function:: sortOn(arr[, fn[, predicate]])

   This implements the same function as ``sort`` but with the order of
   the ``predicate`` and ``fn`` parameters switched. This is
   convenient when you wish to specify ``fn`` without specifying
   ``predicate``.

   ::

      var length = function(x) { return x.length; };
      sortOn(['a', 'ab', ''], length); // => ['', 'a', 'ab']
