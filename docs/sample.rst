.. _sample:

Sample
======

.. toctree::
   :hidden:

   guides
   driftkernels

A generative process is described in WebPPL by combining samples drawn
from :ref:`distribution objects <distributions>` with deterministic
computation. Samples are drawn using the primitive ``sample`` operator
like so::

  sample(dist);

Where ``dist`` is either a :ref:`primitive distribution
<primitive-distributions>` or a distribution obtained as the result of
:ref:`marginal inference <inference>`.

For example, a sample from a standard Gaussian distribution can be
generated using::

  sample(Gaussian({mu: 0, sigma: 1}));

For convenience, all :ref:`primitive distributions
<primitive-distributions>` have a corresponding helper function that
draws a sample from that distribution. For example, sampling from the
standard Gaussian can be more compactly written as::

  gaussian({mu: 0, sigma: 1});

The name of each of these helper functions is obtained by taking the
name of the corresponding distribution and converting the first letter
to lower case.

The ``sample`` primitive also takes an optional second argument. This
is used to specify :ref:`guide distributions <guides>` and :ref:`drift
kernels <driftkernels>`.
