Inference
=========

Enumeration
-----------

.. js:function:: Enumerate(thunk[, maxExecutions])

   :param function thunk: Program to perform inference in.
   :param number maxExecutions: Maximum number of (complete) executions to enumerate.
   :returns: Marginal ERP

   This method performs inference by enumeration. If ``maxExecutions``
   is not specified, exhaustive enumeration is performed. Otherwise,
   paths through the program are explored using a "most probable first"
   heuristic until the maximum number of executions is reached.

   Alternative search strategies are available using the following
   methods:

   * :js:func:`EnumerateBreadthFirst`
   * :js:func:`EnumerateDepthFirst`
   * :js:func:`EnumerateLikelyFirst`.

   Example usage::

     Enumerate(model, 10);

.. js:function:: EnumerateBreadthFirst(thunk[, maxExecutions])

   See :js:func:`Enumerate`

.. js:function:: EnumerateDepthFirst(thunk[, maxExecutions])

   See :js:func:`Enumerate`

.. js:function:: EnumerateLikelyFirst(thunk[, maxExecutions])

   See :js:func:`Enumerate`

Rejection Sampling
------------------

.. js:function:: Rejection(thunk, numSamples[, maxScore, incremental])

   :param function thunk: Program to perform inference in.
   :param number numSamples: The number of samples to take.
   :param number maxScore: An upper bound on the total factor score
                           per-execution. Only required for
                           incremental mode.
   :param boolean incremental: Enable incremental mode. Default: ``false``.
   :returns: Marginal ERP

   This method performs inference using rejection sampling.

   Incremental mode improves efficiency by rejecting samples before
   execution reaches the end of the program where possible. This
   requires:

   * The ``maxScore`` argument to be given, with ``maxScore <= 0``.
   * Every call to ``factor(score)`` in the program (across all
     possible executions) to have ``score <= 0``.

   Example usage::

     Rejection(model, 100);

MCMC
----

.. js:function:: MCMC(thunk[, options])

   :param function thunk: Program to perform inference in.
   :param object options: Options.
   :returns: Marginal ERP

   This method performs inference using Markov chain Monte Carlo.

   The following options are supported:

      .. describe:: samples

         The number of samples to take.

         Default: ``100``

      .. describe:: lag

         The number of additional iterations to perform between
         samples.

         Default: ``0``

      .. describe:: burn

         The number of additional iterations to perform before
         collecting samples.

         Default: ``0``

      .. describe:: kernel

         The transition kernel to use for inference. See `Kernels`_.

         Default: ``'MH'``

      .. describe:: verbose

         When ``true``, print the current iteration and acceptance
         ratio to the console during inference.

         Default: ``false``

      .. describe:: justSample

         When ``true``, maintain an array of all samples taken. This
         is available via the ``samples`` property of the returned
         marginal ERP. ``justSample`` implies ``onlyMAP``.

         Default: ``false``

      .. describe:: onlyMAP

         When ``true``, return a delta ERP on the sampled value with
         the highest score instead of a marginal ERP built from all
         samples.

         Default: ``false``

   Example usage::

     MCMC(model, { samples: 1000, lag: 100, burn: 5 });

Kernels
^^^^^^^

The following kernels are available:

.. describe:: MH

   Implements single site Metropolis-Hastings. [wingate11]_

Example usage::

    MCMC(model, { kernel: 'MH' });

.. describe:: HMC

   Implements Hamiltonian Monte Carlo. [neal11]_

   As the HMC algorithm is only applicable to continuous variables,
   ``HMC`` is a cycle kernel which includes a MH step for discrete
   variables.

   The following options are supported:

   .. describe:: steps

      The number of steps to take per-iteration.

      Default: ``5``

   .. describe:: stepSize

      The size of each step.

      Default: ``0.1``

Example usage::

    MCMC(model, { kernel: 'HMC' });
    MCMC(model, { kernel: { HMC: { steps: 10, stepSize: 1 }}});

Incremental MH
--------------

.. js:function:: IncrementalMH(thunk, numIterations[, options])

   :param function thunk: Program to perform inference in.
   :param number numIterations: The total number of iterations to
                                perform. (Including burn-in and lag.)
   :param object options: Options.
   :returns: Marginal ERP

   This method performs inference using C3. [ritchie15]_

   The following options are supported:

      .. describe:: lag

         The number of iterations to perform before collecting
         samples.

         Default: ``0``

      .. describe:: burn

         The number of iterations to perform between samples.

         Default: ``0``

      .. describe:: verbose

         When ``true``, print the current iteration to the console
         during inference.

         Default: ``false``

      .. describe:: justSample

         When ``true``, maintain an array of all samples taken. This
         is available via the ``samples`` property of the returned
         marginal ERP. ``justSample`` implies ``onlyMAP``.

         Default: ``false``

      .. describe:: onlyMAP

         When ``true``, return a delta ERP on the sampled value with
         the highest score instead of a marginal ERP built from all
         samples.

         Default: ``false``

   Example usage::

     IncrementalMH(model, 100, { lag: 5, burn: 10 });

SMC
---

.. js:function:: SMC(thunk[, options])

   :param function thunk: Program to perform inference in.
   :param object options: Options.
   :returns: Marginal ERP

   This method performs inference using sequential Monte Carlo. When
   ``rejuvSteps`` is 0, this method is also known as a particle
   filter.

   The following options are supported:

      .. describe:: particles

         The number of particles to simulate.

         Default: ``100``

      .. describe:: rejuvSteps

         The number of MCMC steps to apply to each particle at each
         ``factor`` statement. With this addition, this method is
         often called a particle filter with rejuvenation.

         Default: ``0``

      .. describe:: rejuvKernel

         The MCMC kernel to use for rejuvenation. See `Kernels`_.

         Default: ``'MH'``

   Example usage::

     SMC(model, { particles: 100, rejuvSteps: 5 });

.. rubric:: Bibliography

.. [wingate11] David Wingate, Andreas Stuhlmüller, and Noah D.
               Goodman. "Lightweight implementations of probabilistic
               programming languages via transformational
               compilation." International Conference on Artificial
               Intelligence and Statistics. 2011.

.. [neal11] Radford M. Neal, "MCMC using Hamiltonian dynamics."
            Handbook of Markov Chain Monte Carlo 2 (2011).

.. [ritchie15] Daniel Ritchie, Andreas Stuhlmüller, and Noah D.
               Goodman. "C3: Lightweight Incrementalized MCMC for
               Probabilistic Programs using Continuations and Callsite
               Caching." arXiv preprint arXiv:1509.02151 (2015).
