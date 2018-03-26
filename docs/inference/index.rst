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

.. toctree::
   :hidden:

   conditioning

