.. _guides:

Guides
======

A number of :ref:`inference <inference>` strategies make use of an
auxiliary distribution which we call a *guide distribution*. They are
specified like so::

  sample(dist, {guide: guideDist});

Where ``guideDist`` is a distribution object.

For example::

  sample(Cauchy(params), {guide: Gaussian(guideParams)});
