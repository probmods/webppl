Other
=====

.. js:function:: display(val)

   Prints a representation of the value ``val`` to the console.

.. js:function:: expectation(dist[, fn])

   Computes the expectation of a function ``fn`` under the
   :ref:`distribution <distributions>` given by ``dist``. The
   distribution ``dist`` must have finite support.

   ``fn`` defaults to the identity function when omitted.

   ::

      expectation(Categorical({ps: [.2, .8], vs: [0, 1]})); // => 0.8

.. js:function:: mapObject(fn, obj)

   Returns the object obtained by mapping the function ``fn`` over the
   values of the object ``obj``. Each application of ``fn`` has a
   property name as its first argument and the corresponding value as
   its second argument.

   ::

      var pair = function(x, y) { return [x, y]; };
      mapObject(pair, {a: 1, b: 2}); // => {a: ['a', 1], b: ['b', 2]}

.. js:function:: extend(obj1, obj2, ...)

   Creates a new object and assigns own enumerable string-keyed properties
   of source objects 1, 2, ... to it. Source objects are applied from left
   to right. Subsequent sources overwrite property assignments of previous
   sources.

   ::

      var x = { a: 1, b: 2 };
      var y = { b: 3, c: 4 };
      extend(x, y);  // => { a: 1, b: 3, c: 4 }

.. js:function:: mem(fn)

   Returns a memoized version of ``fn``. The memoized function is
   backed by a cache that is local to the current execution.

   Internally, the memoized function compares its arguments by first
   serializing them with ``JSON.stringify``. This means that memoizing
   a higher-order function will not work as expected, as all functions
   serialize to the same string.
