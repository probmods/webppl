.. _inference:

Inference
=========

*Marginal inference* (or just *inference*) is the process of reifying
the distribution on return values implicitly represented by a
:ref:`stochastic computation<sample>`.

(In general, computing this distribution is intractable, so often the
goal is to compute an approximation to it.)

This is achieved WebPPL using the ``Infer(options, model)`` function
which takes a function of zero arguments representing a stochastic
computation, ``model``, and returns the distribution on return values
represented as a :ref:`distribution object<distributions>`.

Several implementations of marginal inference are built into WebPPL.
The ``method`` option is used to specify which implementation should
be used. For example::

  Infer({method: 'enumerate'}, function() {
    return flip() + flip();
  });

Information about the individual methods is available here:

.. toctree::
   :maxdepth: 2

   methods

.. _factor:

Factor
------

The ``factor`` operator is a used *within* marginal inference to alter
the implicit distribution of a stochastic computation by arbitrarily
weighting particular executions.

Note that because ``factor`` *interacts* with inference, it cannot be
used outside of ``Infer``. Attempting to do so will produce an error.

Marginal inference is often used to perform Bayesian inference. In
this setting, the stochastic computation represents the prior, the
``factor`` operator is used to introduce observations, and marginal
inference computes the posterior distribution. This common pattern is
aided by the helper function ``condition``.

See `dippl.org
<http://dippl.org/chapters/02-webppl.html#and-inference>`_ and
`agentmodels.org
<http://agentmodels.org/chapters/2-webppl.html#bayesian-inference-by-conditioning>`_
for an introduction to these ideas.
