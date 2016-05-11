Inference
=========

.. js:function:: Infer(thunk, options)

   :param function thunk: Program to perform inference in.
   :param object options: Inference options.

``Infer`` computes the marginal distribution on return values of a
program. The program is specified as a function of zero arguments,
also known as a `thunk`.

The inference algorithm to use must be specified using the ``method``
option. For example::

  Infer(thunk, {method: 'Enumerate'})

The following algorithms are available:

Enumeration
-----------

.. js:function:: Infer(thunk, {method: 'Enumerate'[, ...]})

   This method performs inference by enumeration.

   The following options are supported:

   .. describe:: maxExecutions

      Maximum number of (complete) executions to enumerate.

   If ``maxExecutions`` is not specified, exhaustive enumeration is
   performed. Otherwise, paths through the program are explored using
   a "most probable first" heuristic until the maximum number of
   executions is reached.

   Alternatively, the search strategy can be specified explicitly
   using the ``EnumerateBreadthFirst``, ``EnumerateDepthFirst`` or
   ``EnumerateLikelyFirst`` methods.

   Example usage::

     Infer(thunk, {method: 'Enumerate', maxExecutions: 10});
     Infer(thunk, {method: 'EnumerateBreadthFirst'});

Rejection Sampling
------------------

.. js:function:: Infer(thunk, {method: 'Rejection'[, ...]})

   This method performs inference using rejection sampling.

   The following options are supported:

   .. describe:: samples

      The number of samples to take.

      Default: ``1``

   .. describe:: maxScore

      An upper bound on the total factor score per-execution. Only
      required for incremental mode.

   .. describe:: incremental

      Enable incremental mode.

      Default: ``false``

   Incremental mode improves efficiency by rejecting samples before
   execution reaches the end of the program where possible. This
   requires:

   * The ``maxScore`` argument to be given, with ``maxScore <= 0``.
   * Every call to ``factor(score)`` in the program (across all
     possible executions) to have ``score <= 0``.

   Example usage::

     Infer(thunk, {method: 'Rejection', samples: 100});

MCMC
----

.. js:function:: Infer(thunk, {method: 'MCMC'[, ...]})

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
         marginal distribution. ``justSample`` implies ``onlyMAP``.

         Default: ``false``

      .. describe:: onlyMAP

         When ``true``, return a delta distribution on the sampled
         value with the highest score instead of a marginal
         distribution built from all samples.

         Default: ``false``

   Example usage::

     Infer(thunk, {samples: 1000, lag: 100, burn: 5});

Kernels
^^^^^^^

The following kernels are available:

.. describe:: MH

   Implements single site Metropolis-Hastings. [wingate11]_

Example usage::

    Infer(thunk, {method: 'MCMC', kernel: 'MH'});

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

    Infer(thunk, {method: 'MCMC', kernel: 'HMC'});
    Infer(thunk, {method: 'MCMC', kernel: {HMC: {steps: 10, stepSize: 1}}});

Incremental MH
--------------

.. js:function:: Infer(thunk, {method: 'IncrementalMH'[, ...]})

   This method performs inference using C3. [ritchie15]_

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

      .. describe:: verbose

         When ``true``, print the current iteration to the console
         during inference.

         Default: ``false``

      .. describe:: justSample

         When ``true``, maintain an array of all samples taken. This
         is available via the ``samples`` property of the returned
         marginal distribution. ``justSample`` implies ``onlyMAP``.

         Default: ``false``

      .. describe:: onlyMAP

         When ``true``, return a delta distribution on the sampled
         value with the highest score instead of a marginal
         distribution built from all samples.

         Default: ``false``

   Example usage::

     Infer(thunk, {method: 'IncrementalMH', samples: 100, lag: 5, burn: 10});

   To maximize efficiency when inferring marginals over multiple variables, use the ``query`` table, rather than building up a list of variable values::

      var model = function() {
        var hmm = function(n, obs) {
          if (n === 0) return true;
          else {
            var prev = hmm(n-1, obs);
            var state = transition(prev);
            observation(state, obs[n]);
            query.add(n, state);
            return state;
          }
        };
        hmm(100, observed_data);
        return query;
      }
      Infer(model, {method: 'IncrementalMH', samples: 100, lag: 5, burn: 10});

   ``query`` is a write-only table which can be returned from a program (and thus marginalized). The only operation it supports is adding named values:

      .. js:function:: query.add(name, value)

         :param any name: Name of value to be added to query. Will be converted to string, as Javascript object keys are.
         :param any value: Value to be added to query.
         :returns: undefined


SMC
---

.. js:function:: Infer(thunk, {method: 'SMC'[, ...]})

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

     Infer(thunk, {method: 'SMC', particles: 100, rejuvSteps: 5});

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
               Caching." International Conference on Artificial
               Intelligence and Statistics. 2016.
