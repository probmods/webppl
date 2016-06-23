.. _guides:

Guides
======

.. this should end up as part of the ``sample`` docs

A random choice is denoted by::

  sample(dist);

Where ``dist`` is either a :ref:`primitive distribution
<distributions>` object or the result of :ref:`marginal inference
<inference>`.

For example::

  sample(Cauchy(params));

A number of inference strategies make use of an auxiliary distribution
which we call a *guide distribution*. They are specified like so::

  sample(dist, {guide: guideDist});

Where ``guideDist`` is also a distribution object.

For example::

  sample(Cauchy(params), {guide: Gaussian(guideParams)});
