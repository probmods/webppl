Distributions
=============

.. js:function:: Bernoulli({p: ...})

  * p: *success probability (probability in [0, 1])*

  Distribution on {true,false}

.. js:function:: Beta({a: ..., b: ...})

  * a: *shape (real > 0)*
  * b: *shape (real > 0)*

  Distribution on [0, 1]

.. js:function:: Binomial({p: ..., n: ...})

  * p: *success probability (probability in [0,1])*
  * n: *number of trials (integer > 0)*

  Distribution over the number of successes for n independent ``Bernoulli({p: p})`` trials

.. js:function:: Categorical({ps: ..., vs: ...})

  * ps: *probabilities (array of probabilities in [0,1])*
  * vs: *support (array of values)*

  Distribution over elements of vs with ``P(vs[i]) = ps[i]``

.. js:function:: Cauchy({location: ..., scale: ...})

  * location: *(real in [-Infinity, Infinity])*
  * scale: *(real > 0)*

  Distribution over ``[-Infinity, Infinity]``

.. js:function:: Delta({v: ...})

  * v: *support element*

  Discrete distribution that assigns probability one to the single element in its support. This is only useful in special circumstances as sampling from ``Delta({v: val})`` can be replaced with ``val`` itself. Furthermore, a ``Delta`` distribution parameterized by a random choice should not be used with MCMC based inference, as doing so produces incorrect results.

.. js:function:: Dirichlet({alpha: ...})

  * alpha: *concentration parameters (array of reals > 0)*

  Distribution over arrays of probabilities.

.. js:function:: DirichletDrift({alpha: ...})

  * alpha: *concentration parameters (array of reals > 0)*

  Drift version of Dirichlet. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

.. js:function:: Discrete({ps: ...})

  * ps: *array of probabilities in [0,1]*

  Distribution on ``{0,1,...,ps.length-1}`` with P(i) proportional to ``ps[i]``

.. js:function:: Exponential({a: ...})

  * a: *rate (real > 0)*

  Distribution on ``[0, Infinity]``

.. js:function:: Gamma({shape: ..., scale: ...})

  * shape: *shape parameter (real > 0)*
  * scale: *scale parameter (real > 0)*

  Distribution over positive reals.

.. js:function:: Gaussian({mu: ..., sigma: ...})

  * mu: *mean (real)*
  * sigma: *standard deviation (real > 0)*

  Distribution over reals.

.. js:function:: GaussianDrift({mu: ..., sigma: ...})

  * mu: *mean (real)*
  * sigma: *standard deviation (real > 0)*

  Drift version of Gaussian. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

.. js:function:: Multinomial({ps: ..., n: ...})

  * ps: *probabilities (array of reals that sum to 1)*
  * n: *number of trials (integer > 0)*

  Distribution over counts for n independent ``Discrete({ps: ps})`` trials

.. js:function:: MultivariateGaussian({mu: ..., cov: ...})

  * mu: *mean vector (array of reals)*
  * cov: *covariance matrix  (array of array of realsthat must be symmetric positive semidefinite)*

  n-dimensional Gaussian.

.. js:function:: Poisson({mu: ...})

  * mu: *mean (real >0)*

  Distribution over integers.

.. js:function:: RandomInteger({n: ...})

  * n: *number of possible values (integer >= 1)*

  Uniform distribution on {0,1,...,n-1}

.. js:function:: Uniform({a: ..., b: ...})

  * a: *Lower bound (real)*
  * b: *Upper bound (real > a)*

  Continuous uniform distribution on [a, b]

.. js:function:: UniformDrift({a: ..., b: ..., r: ...})

  * a: *Lower bound (real)*
  * b: *Upper bound (real > a)*
  * r: *drift kernel radius*

