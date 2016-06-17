.. _guides:

Guides
======

Creating parameters
-------------------

.. js:function:: scalarParam(mean, sd)

   :param real mean: mean (optional)
   :param number sd: standard deviation (optional)

   Creates a new scalar valued parameter initialized with a draw from
   a Gaussian distribution.

   If ``sd`` is omitted the initial value is ``mean``. If ``mean`` is
   omitted it defaults to zero.

   Example::

     scalarParam(0, 1)

.. js:function:: tensorParam(dims, mean, sd)

   :param array dims: dimension of tensor
   :param number mu: mean (optional)
   :param number sd: standard deviation (optional)

   Creates a new tensor valued parameter. Each element is initialized
   with an independent draw from a Gaussian distribution.

   If ``sd`` is omitted the initial value of each element is ``mean``.
   If ``mean`` is omitted it defaults to zero.

   Example::

     tensorParam([10, 10], 0, 0.01)

.. js:function:: param(arg1, arg2, arg3)
