Distributions
=============

.. js:function:: Bernoulli({p: ...})

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

  Distribution over arrays of probabilities. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

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

  * shape
  * scale

.. js:function:: Gaussian({mu: ..., sigma: ...})

  * mu: *mean*
  * sigma: *standard deviation*

.. js:function:: GaussianDrift({mu: ..., sigma: ...})

  * mu: *mean*
  * sigma: *standard deviation*

.. js:function:: Marginal({dist: ...})

  * dist

.. js:function:: Multinomial({ps: ..., n: ...})

  * ps: *probabilities*
  * n: *number of trials*

  Distribution over counts for n independent ``Discrete({ps: ps})`` trials

.. js:function:: MultivariateGaussian({mu: ..., cov: ...})

  * mu: *mean vector*
  * cov: *covariance matrix*

.. js:function:: Poisson({mu: ...})

  * mu

.. js:function:: RandomInteger({n: ...})

  * n

  Uniform distribution on {0,1,...,n-1}

.. js:function:: Uniform({a: ..., b: ...})

  * a
  * b

  Continuous uniform distribution on [a, b]

.. js:function:: UniformDrift({a: ..., b: ..., r: ...})

  * a
  * b
  * r: *drift kernel radius*

