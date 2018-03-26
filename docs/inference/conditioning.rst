.. _conditioning:

Conditioning
============

Conditioning is supported through the use of the ``condition``,
``observe`` and ``factor`` operators. Only a brief summary of these
methods is given here. For a more detailed introduction, see the
`Probabilistic Models of Cognition chapter on conditioning
<https://probmods.org/chapters/03-conditioning.html>`_.

Note that because these operators *interact* with inference, they can
only be used *during* inference. Attempting to use them outside of
inference will produce an error.

.. js:function:: condition(bool)

   Conditions the marginal distribution on an arbitrary proposition.
   Here, ``bool`` is the value obtained by evaluating the proposition.

   Example usage::

      var model = function() {
        var a = flip();
        var b = flip();
        condition(a || b)
        return a;
      };

.. js:function:: observe(distribution, value[, sampleOpts])

   Conceptually, this is shorthand for drawing a value from
   ``distribution`` and then conditioning on the value drawn being
   equal to ``value``, which could be written as::

     var x = sample(distribution);
     condition(x === value);
     return x;

   However, in many cases expressing the condition in this way would
   be exceedingly inefficient, so ``observe`` uses a more efficient
   implementation internally.

   In particular, it's *essential* to use ``observe`` to condition on
   the value drawn from a *continuous* ``distribution``.

   When ``value`` is ``undefined`` no conditioning takes place, and
   ``observe`` simply returns a sample from ``distribution``. In this
   case, ``sampleOpts`` can be used to specify any options that should
   be used when sampling. Valid options are exactly those that can be
   given as the second argument to :ref:`sample <sample>`.

   Example usage::

      var model = function() {
        var mu = gaussian(0, 1);
        observe(Gaussian({mu: mu, sigma: 1}), 5);
        return mu;
      };

.. js:function:: factor(score)

   Adds ``score`` to the log probability of the current execution.
