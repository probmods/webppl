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

      Default: ``'adagrad'``

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

  Optimize(model, {steps: 100});
  Optimize(model, {optMethod: 'adagrad'});
  Optimize(model, {optMethod: {sgd: {stepSize: 0.5}}});

Estimators
++++++++++

The following estimators are available:

.. describe:: ELBO

   This is the KL divergence between the guide and the target, also
   know as the evidence lower-bound. Optimizing this objective yields
   variational inference.

   The following options are supported:

   .. describe:: samples

      The number of samples to take for each gradient estimate.

      Default: ``1``

Example usage::

  Optimize(model, {estimator: 'ELBO'});
  Optimize(model, {estimator: {ELBO: {samples: 10}}});

.. _parameters:

Parameters
~~~~~~~~~~

.. js:function:: scalarParam(mean, sd)

   :param real mean: mean (optional)
   :param number sd: standard deviation (optional)
   :returns: the current value of the parameter

   Creates a new scalar valued parameter initialized with a draw from
   a Gaussian distribution.

   If ``sd`` is omitted the initial value is ``mean``. If ``mean`` is
   omitted it defaults to zero.

   Example::

     scalarParam(0, 1)

.. js:function:: tensorParam(dims, mean, sd)

   :param array dims: dimension of tensor
   :param number mu: mean (optional)
   :param number sd: standard deviation (optional)
   :returns: the current value of the parameter

   Creates a new tensor valued parameter. Each element is initialized
   with an independent draw from a Gaussian distribution.

   If ``sd`` is omitted the initial value of each element is ``mean``.
   If ``mean`` is omitted it defaults to zero.

   Example::

     tensorParam([10, 10], 0, 0.01)

.. _adnn optimization module: https://github.com/dritchie/adnn/tree/master/opt
