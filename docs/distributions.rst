Distributions
=============

.. js:function:: Bernoulli({p: ... })

  * p: *success probability* (probability in [0, 1])

  Distribution on {true,false}

  `Wikipedia entry <https://en.wikipedia.org/wiki/Bernoulli_distribution>`_.

.. js:function:: Beta({a: ..., b: ...})


  * a: *shape* (real > 0)
  * b: *shape* (real > 0)

 Distribution on [0, 1]

  `Wikipedia entry <https://en.wikipedia.org/wiki/Beta_distribution>`_.

.. js:function:: Binomial({p: ..., n: ...})

  * p: *success probability* (probability in [0, 1])
  * n: *number of trials* (integer > 0)

  Distribution over the number of successes for n independent ``Bernoulli({p: p})`` trials

  `Wikipedia entry <https://en.wikipedia.org/wiki/Binomial_distribution>`_.

.. js:function:: Categorical({ps: ..., vs: ...})

  * ps: *probabilities* (array of probabilities in [0, 1])
  * vs: *support* (array of values)

  Distribution over elements of vs with ``P(vs[i]) = ps[i]``

  `Wikipedia entry <https://en.wikipedia.org/wiki/Categorical_distribution>`_.

.. js:function:: Cauchy({location: ..., scale: ...})

  * *location* (real in [-Infinity, Infinity])
  * *scale* (real > 0)

  Distribution over ``[-Infinity, Infinity]``

  `Wikipedia entry <https://en.wikipedia.org/wiki/Cauchy_distribution>`_.

.. js:function:: Dirichlet({alpha: ...})

  * alpha: *concentration parameters* (array of reals > 0)

  Distribution over arrays of probabilities.

  `Wikipedia entry <https://en.wikipedia.org/wiki/Dirichlet_distribution>`_.

.. js:function:: DirichletDrift({alpha: ...})

  * alpha: *concentration parameters* (array of reals > 0)

  Drift version of Dirichlet. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

  `Wikipedia entry <https://en.wikipedia.org/wiki/Dirichlet_distribution>`_.

.. js:function:: Discrete({ps: ...})

  * ps: *probabilities* (array of probabilities in [0,1])

  Distribution on ``{0,1,...,ps.length-1}`` with P(i) proportional to ``ps[i]``

  `Wikipedia entry <https://en.wikipedia.org/wiki/Categorical_distribution>`_.

.. js:function:: Exponential({a: ...})

  * a: *rate* (real > 0)

  Distribution on ``[0, Infinity]``

 `Wikipedia entry <https://en.wikipedia.org/wiki/Exponential_distribution>`_.

.. js:function:: Gamma({shape: ..., scale: ...})

  * shape: *shape parameter* (real >0)
  * scale: *scale parameter* (real >0)

  Distribution over positive reals.

  `Wikpedia entry <https://en.wikipedia.org/wiki/Gamma_distribution>`_

.. js:function:: Gaussian({mu: ..., sigma: ...})

  * mu: *mean* (real number)
  * sigma: *standard deviation* (real number >0)

  Distribution over reals.

  `Wikpedia entry <https://en.wikipedia.org/wiki/Gaussian_distribution>`_

.. js:function:: GaussianDrift({mu: ..., sigma: ...})

  * mu: *mean* (real)
  * sigma: *standard deviation* (real >0)

  Drift version of Gaussian. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

.. js:function:: Marginal({dist: ...})

  * dist

.. js:function:: Multinomial({ps: ..., n: ...})

  * ps: *probabilities* (array of reals that sum to 1)
  * n: *number of trials* (integer >0)

  Distribution over counts for n independent ``Discrete({ps: ps})`` trials

  `Wikpedia entry <https://en.wikipedia.org/wiki/Multinomial_distribution>`_

.. js:function:: MultivariateGaussian({mu: ..., cov: ...})

  * mu: *mean vector* (array of reals)
  * cov: *covariance matrix*. (array of array of reals that must be symmetric positive semidefinite)

  n-dimensional Gaussian.

  `Wikipedia entry <https://en.wikipedia.org/wiki/Multivariate_normal_distribution>`_

.. js:function:: Poisson({mu: ...})

  * mu: *mean* (real >0)

  Distribution over integers.

  `Wikipedia entry <https://en.wikipedia.org/wiki/Poisson_distribution>`_

.. js:function:: RandomInteger({n: ...})

  * n: *number of possible values* (integer >= 1)

  Uniform distribution on {0,1,...,n-1}

  `Wikpedia entry <https://en.wikipedia.org/wiki/Uniform_distribution_(discrete)>`_

.. js:function:: Uniform({a: ..., b: ...})

  * a: *lower bound* (real)
  * b: *upper bound* (real >a)

  Continuous uniform distribution on [a, b]

  `Wikpedia entry <https://en.wikipedia.org/wiki/Uniform_distribution_(continuous)>`_

.. js:function:: UniformDrift({a: ..., b: ..., r: ...})

  * a: *lower bound* (real)
  * b: *upper bound* (real >a)
  * r: *drift kernel radius*

  Drift version of Uniform. Drift kernels are used to narrow search during inference. UniformDrift proposes from a symmetric window around the current value x, [x-r, x+r].
