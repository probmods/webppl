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

.. js:function:: marginalize(dist, project)

   Marginalizes out certain variables in a distribution. ``project``
   can be either a function or a string. Using it as a function:

   ::

      var dist = Infer({model: function() {
        var a = flip(0.9);
        var b = flip();
        var c = flip();
        return {a: a, b: b, c: c};
      }});

      marginalize(dist, function(x) {
        return x.a;
      }) // => Marginal with p(true) = 0.9, p(false) = 0.1

   Using it as a string:

   ::

     marginalize(dist, 'a') // => Marginal with p(true) = 0.9, p(false) = 0.1

.. js:function:: forward(model)

   Evaluates function of zero arguments ``model``, ignoring any
   :ref:`factor <factor>` statements.

   Also see: :ref:`Forward Sampling <forward_sampling>`

.. js:function:: forwardGuide(model)

   Evaluates function of zero arguments ``model``, ignoring any
   ``factor`` statements, and sampling from the :ref:`guide <guides>`
   at each random choice.

   Also see: :ref:`Forward Sampling <forward_sampling>`

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

.. js:function:: cache(fn, maxSize)

   Returns a memoized version of ``fn``. The memoized function is
   backed by a cache that is shared across all executions/possible
   worlds.

   ``cache`` is provided as a means of avoiding the repeated
   computation of a *deterministic* function. The use of ``cache``
   with a *stochastic* function is unlikely to be appropriate. For
   stochastic memoization see :js:func:`mem`.

   When ``maxSize`` is specified the memoized function is backed by a
   LRU cache of size ``maxSize``. The cache has unbounded size when
   ``maxSize`` is omitted.

   ``cache`` can be used to memoize mutually recursive functions,
   though for technical reasons it must currently be called as
   ``dp.cache`` for this to work.

.. js:function:: mem(fn)

   Returns a memoized version of ``fn``. The memoized function is
   backed by a cache that is local to the current execution.

   Internally, the memoized function compares its arguments by first
   serializing them with ``JSON.stringify``. This means that memoizing
   a higher-order function will not work as expected, as all functions
   serialize to the same string.

.. js:function:: error(msg)

   Halts execution of the program and prints ``msg`` to the console.
