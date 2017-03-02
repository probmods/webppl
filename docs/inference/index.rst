.. _inference:

Inference
=========

*Marginal inference* (or just *inference*) is the process of reifying
the distribution on return values implicitly represented by a
:ref:`stochastic computation<sample>`.

(In general, computing this distribution is intractable, so often the
goal is to compute an approximation to it.)

This is achieved in WebPPL using the ``Infer`` function, which takes a
function of zero arguments representing a stochastic computation and
returns the distribution on return values represented as a
:ref:`distribution object<distributions>`. For example::

   Infer(function() {
       return flip() + flip();
   });

This example has no inference options specified. By default, ``Infer``
will perform inference using one of the methods among enumeration,
rejection sampling, SMC and MCMC. The method to use is chosen by a decision
tree based on the characteristics of the given model, such as whether it
is enumerable in a timely manner, whether there are interleaving
samples and factors etc. Several other implementations of marginal
inference are also built into WebPPL. Information about the individual
methods is available here:

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
