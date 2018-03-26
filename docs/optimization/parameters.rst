.. _parameters:

Parameters
==========

.. js:function:: param([options])

   Retrieves the value of a parameter by name. The parameter is
   created if it does not already exist.

   The following options are supported:

   .. describe:: dims

      When ``dims`` is given, ``param`` returns a tensor of dimension
      ``dims``. In this case ``dims`` should be an array.

      When ``dims`` is omitted, ``param`` returns a scalar.

   .. describe:: init

      A function that computes the initial value of the parameter. The
      function is passed the dimension of a tensor as its only
      argument, and should return a tensor of that dimension.

      When ``init`` is omitted, the parameter is initialized with a
      draw from the Gaussian distribution described by the ``mu`` and
      ``sigma`` options.

   .. describe:: mu

      The mean of the Gaussian distribution from which the initial
      parameter value is drawn when ``init`` is omitted.

      Default: ``0``

   .. describe:: sigma

      The standard deviation of the Gaussian distribution from which
      the initial parameter value is drawn when ``init`` is omitted.
      Specify a standard deviation of ``0`` to deterministically
      initialize the parameter to ``mu``.

      Default: ``0.1``

   .. describe:: name

      The name of the parameter to retrieve. If ``name`` is omitted a
      default name is automatically generated based on the current
      stack address, relative to the current coroutine.

   Examples::

     param()
     param({name: 'myparam'})
     param({mu: 0, sigma: 0.01, name: 'myparam'})
     param({dims: [10, 10]})
     param({dims: [2, 1], init: function(dims) { return ones(dims); }})

.. js:function:: modelParam([options])

   An analog of ``param`` used to create or retrieve a parameter that
   can be used directly in the model.

   Optimizing the :ref:`ELBO <elbo>` yields maximum likelihood
   estimation for model parameters. ``modelParam`` cannot be used with
   other inference strategies as it does not have an interpretation in
   the fully Bayesian setting. Attempting to do so will raise an
   exception.

   ``modelParam`` supports the same options as ``param``. See the
   :ref:`documentation for param <parameters>` for details.
