.. _optimization:

Optimization
============

Introduction
~~~~~~~~~~~~

Optimization provides an alternative approach to :ref:`marginal
inference <inference>`.

In this section we refer to the program for which we would like to
obtain the marginal distribution as the *target program*.

If we take a target program and add a :ref:`guide distribution
<guides>` to each random choice, then we can define the *guide
program* as the program you get when you sample from the guide
distribution at each ``sample`` statement and ignore all ``factor``
statements.

If we endow this guide program with adjustable parameters, then we can
optimize those parameters so as to minimize the distance between the
joint distribution of the choices in the guide program and those in
the target.

This general approach includes a number of well-known algorithms as
special cases.

It is supported in WebPPL by :ref:`a method for performing
optimization <optimize>`, primitives for specifying :ref:`parameters
<parameters>`, and the ability to specify guides.

.. _optimize:

Optimize
~~~~~~~~

.. js:function:: Optimize(model, options)

   :param function model: Specifies the guide program.
   :param object options: Optimization options.
   :returns: Optimized parameters.

   Optimizes the parameters of the guide program.

   The following options are supported:

   .. describe:: steps

      The number of optimization steps to take.

      Default: ``1``

   .. describe:: optMethod

      The optimization method used. The following methods are
      available:

      * ``'sgd'``
      * ``'adagrad'``
      * ``'rmsprop'``
      * ``'adam'``

      Each method takes a ``stepSize`` sub-option, see below for
      example usage. Additional method specific options are available,
      see the `adnn optimization module`_ for details.

      Default: ``'adam'``

   .. describe:: estimator

      Specifies the optimization objective and the method used to
      estimate its gradients. See `Estimators`_.

      Default: ``ELBO``

   .. describe:: params

      Initial parameter values.

      Default: ``{}``

   .. describe:: verbose

      Default: ``true``


Example usage::

  var newParams = Optimize(model, {steps: 100});
  var newParams = Optimize(model, {steps: 100, params: oldParams});
  var newParams = Optimize(model, {optMethod: 'adagrad'});
  var newParams = Optimize(model, {optMethod: {sgd: {stepSize: 0.5}}});

Estimators
++++++++++

The following estimators are available:

.. _elbo:

.. describe:: ELBO

   This is the KL divergence between the guide and the target, also
   know as the evidence lower-bound. Optimizing this objective yields
   variational inference.

   The following options are supported:

   .. describe:: samples

      The number of samples to take for each gradient estimate.

      Default: ``1``

   .. describe:: avgBaselines

      Enable the "average baseline removal" variance reduction
      strategy.

      Default: ``true``

   .. describe:: avgBaselineDecay

      The decay rate used in the exponential moving average used to
      estimate baselines.

      Default: ``0.9``

Example usage::

  Optimize(model, {estimator: 'ELBO'});
  Optimize(model, {estimator: {ELBO: {samples: 10}}});

.. _parameters:

Parameters
~~~~~~~~~~

.. _param:

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
   estimation for model parameters. ``modelParam`` cannot used with
   other inference strategies as it does not have an interpretation in
   the fully Bayesian setting. Attempting to do so will raise an
   exception.

   ``modelParam`` supports the same options as ``param``. See the
   :ref:`documentation for param <param>` for details.

.. _adnn optimization module: https://github.com/dritchie/adnn/tree/master/opt
