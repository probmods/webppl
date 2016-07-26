.. _distributions:

Distributions
=============

Distribution objects represent probability distributions, they have
two principle uses:

1. Samples be generated from a distribution by passing a distribution
   object to the :ref:`sample <sample>` operator.

2. The logarithm of the probability (or density) that a distribution
   assigns to a value can be computed using ``dist.score(val)``. For
   example::

     Bernoulli({p: .1}).score(true); // returns Math.log(.1)

Several :ref:`primitive distributions <primitive-distributions>` are
built into the language. Further distributions are created by
performing :ref:`marginal inference <inference>`.

.. _primitive-distributions:

Primitives
----------

.. include:: primitive-distributions.txt
