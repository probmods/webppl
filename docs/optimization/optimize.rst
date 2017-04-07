Optimize
========

.. _optimize:

.. js:function:: Optimize(options)

   :param object options: Optimization options.
   :returns: Nothing.

   Optimizes the parameters of the guide program specified by the
   ``model`` option.

   The following options are supported:

   .. describe:: model

      A function of zero arguments that specifies the target and guide
      programs.

      This option must be present.

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

   .. describe:: weightDecay

      Specifies the strength of an L2 penalty applied to all
      parameters during optimization.

      More specifically, a term ``0.5 * strength * paramVal^2`` is
      added to the objective for each parameter encountered during
      optimization. Note that this addition is not reflected in the
      value of the objective reported during optimization.

      For parameters of the model, when the objective is the ELBO,
      this is equivalent to specifying a mean zero and variance
      ``1/strength`` Gaussian prior and a Delta guide for each
      parameter.

      Default: ``0``

   .. describe:: onStep

      Specifies a function that will be called after each step. The
      function will be passed the index of the current step and the
      value of the objective as arguments. For example::

        var callback = function(index, value) { /* ... */ };
        Optimize({model: model, steps: 100, onStep: callback});

   .. describe:: verbose

      Default: ``true``


Example usage::

  Optimize({model: model, steps: 100});
  Optimize({model: model, optMethod: 'adagrad'});
  Optimize({model: model, optMethod: {sgd: {stepSize: 0.5}}});

Estimators
----------

The following estimators are available:

.. _elbo:

.. describe:: ELBO

   This is the evidence lower bound (ELBO). Optimizing this objective
   yields variational inference.

   For best performance use :js:func:`mapData` in place of
   :js:func:`map` where possible when optimizing this objective. The
   conditional independence information this provides is used to
   reduce the variance of gradient estimates which can significantly
   improve performance, particularly in the presence of discrete
   random choices. Data sub-sampling is also supported through the use
   of :js:func:`mapData`.

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

  Optimize({model: model, estimator: 'ELBO'});
  Optimize({model: model, estimator: {ELBO: {samples: 10}}});

.. _adnn optimization module: https://github.com/dritchie/adnn/tree/master/opt
