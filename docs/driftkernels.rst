.. _driftkernels:

Drift Kernels
=============

Introduction
------------

The default behavior of MH based :ref:`inference <inference>`
algorithms is to generate proposals by sampling from the prior. This
strategy is generally applicable, but can be inefficient when the
prior places little mass in areas where the posterior mass in
concentrated. In such situations the algorithm may make many proposals
before a move is accepted.

An alternative is to sample proposals from a distribution centered on
the previous value of the random choice to which we are proposing.
This produces a random walk that allows inference to find and explore
areas of high probability in a more systematic way. This type of
proposal distribution is called a drift kernel.

This strategy has the potential to perform better than sampling from
the prior. However, the width of the proposal distribution affects the
efficiency of inference, and will often need tuning by hand to obtain
good results.

Specifying drift kernels
------------------------

A drift kernel is represented in a WebPPL program as a function that
maps from the previous value taken by a random choice to a
:ref:`distribution <distributions>`.

For example, to propose from a Gaussian distribution centered on the
previous value we can use the following function::

  var gaussianKernel = function(prevVal) {
    return Gaussian({mu: prevVal, sigma: .1});
  };

This function can be used to specify a drift kernel at any ``sample``
statement using the ``driftKernel`` option like so::

  sample(dist, {driftKernel: kernelFn});

To use our ``gaussianKernel`` with a Cauchy random choice we would
write::

  sample(Cauchy(params), {driftKernel: gaussianKernel});

Helpers
-------

A number of built-in helpers provide sensible drift kernels for
frequently used distributions. These typically take the same
parameters as the :ref:`distribution <distributions>` from which they
sample, plus an extra parameter to control the width of the proposal
distribution.

.. js:function:: gaussianDrift({mu: ..., sigma: ..., width: ...})

.. js:function:: dirichletDrift({alpha: ..., concentration: ...})

.. js:function:: uniformDrift({a: ..., b: ..., width: ...})
