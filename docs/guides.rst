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
