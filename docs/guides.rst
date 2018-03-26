.. _guides:

Guides
======

A number of :ref:`inference <inference>` strategies make use of an
auxiliary distribution which we call a *guide distribution*. They are
specified like so::

  sample(dist, {guide: guideFn});

Where ``guideFn`` is a function that takes zero arguments, and returns
a distribution object.

For example::

  sample(Cauchy(params), {
    guide: function() {
      return Gaussian(guideParams);
    }
  });

Note that such functions will only be called when using an inference
strategy that makes use of the guide.

In some situations, it is convenient to be able to specify part of a
guide computation outside of the functions passed to ``sample``. This
can be accomplished with the ``guide`` function, which takes a
function of zero arguments representing the computation::

  guide(function() {
    // Some guide computation.
  });

As with the functions passed to ``sample``, the function passed to
``guide`` will only be called when required for inference.

It's important to note that ``guide`` does not return the value of the
computation. Instead, the :ref:`global store <globalstore>` should be
used to pass results to subsequent guide computations. This
arrangement encourages a programming style in which there is
separation between the model and the guide.

.. _default_guides:

Default Guide Distributions
---------------------------

Both :ref:`optimization <optimization>` and :ref:`forward sampling
<forward_sampling>` from the guide require that all :ref:`random
choices <sample>` in the model have a corresponding :ref:`guide
distribution <guides>`. So, for convenience, these methods
automatically use an appropriate *default guide distribution* at any
random choice in the model for which a guide distribution is not
specified explicitly.

Default guide distributions can also be used with :ref:`SMC <smc>`.
See the documentation for the ``importance`` option for details.

The default guide distribution used at a particular random choice:

* Is independent of all other guide distributions in the program.
* Has its type determined by the type of the distribution specified in
  the model for the random choice.
* Has each of its continuous parameters hooked up to an optimizable
  :ref:`parameter <parameters>`. These parameters are not shared with
  any other guide distributions in the program.

For example, the default guide distribution for a ``Bernoulli`` random
choice could be written explicitly as::

  var x = sample(Bernoulli({p: 0.5}), {guide: function() {
    return Bernoulli({p: Math.sigmoid(param())});
  }});
