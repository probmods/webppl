Parameters
==========

.. _parameters:

.. js:function:: param([options])

   Retrieves the value of a parameter by name. If the parameter does
   not exist, it is created and initialized with a draw from a
   Gaussian distribution.

   The following options are supported:

   .. describe:: dims

      When ``dims`` is given, ``param`` returns a tensor of dimension
      ``dims``. In this case ``dims`` should be an array.

      When ``dims`` is omitted, ``param`` returns a scalar.

   .. describe:: mu

      The mean of the Gaussian distribution from which the initial
      parameter value is drawn.

      Default: ``0``

   .. describe:: sigma

      The standard deviation of the Gaussian distribution from which
      the initial parameter value is drawn. Specify a standard
      deviation of ``0`` to deterministically initialize the parameter
      to ``mu``.

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
