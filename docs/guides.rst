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
