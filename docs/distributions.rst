Distributions
=============

.. js:function:: Bernoulli({p: ...})

  * p: success probability *(in [0,1])*

  Distribution on {true,false}

.. js:function:: Beta({a: ..., b: ...})

  * a: shape (real) *(>0)*
  * b: shape (real) *(>0)*

  Distribution on [0, 1]

.. js:function:: Binomial({p: ..., n: ...})

  * p: success probability *(in [0,1])*
  * n: number of trials (integer > 0)

  Distribution over the number of successes for n independent ``Bernoulli({p: p})`` trials

.. js:function:: Categorical({ps: ..., vs: ...})

  * ps: array of probabilities *(in [0,1])*
  * vs: support (array of values)

  Distribution over elements of vs with ``P(vs[i]) = ps[i]``

.. js:function:: Cauchy({location: ..., scale: ...})

  * location: (real in [-Infinity, Infinity])
  * scale: (real) *(>0)*

  Distribution over ``[-Infinity, Infinity]``

.. js:function:: Delta({v: ...})

  * v: support element

  Discrete distribution that assigns probability one to the single element in its support. This is only useful in special circumstances as sampling from ``Delta({v: val})`` can be replaced with ``val`` itself. Furthermore, a ``Delta`` distribution parameterized by a random choice should not be used with MCMC based inference, as doing so produces incorrect results.

.. js:function:: DiagCovGaussian({mu: ..., sigma: ...})

  * mu: vector of means
  * sigma: vector of standard deviations *(>0)*

  Multivariate Gaussian distribution with diagonal covariance matrix.

.. js:function:: Dirichlet({alpha: ...})

  * alpha: vector of concentration parameters *(>0)*

  Distribution over arrays of probabilities.

.. js:function:: DirichletDrift({alpha: ...})

  * alpha: vector of concentration parameters *(>0)*

  Drift version of Dirichlet. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

.. js:function:: Discrete({ps: ...})

  * ps: array or vector of probabilities *(in [0,1])*

  Distribution on ``{0,1,...,ps.length-1}`` with P(i) proportional to ``ps[i]``

.. js:function:: Exponential({a: ...})

  * a: rate (real) *(>0)*

  Distribution on ``[0, Infinity]``

.. js:function:: Gamma({shape: ..., scale: ...})

  * shape: shape parameter (real) *(>0)*
  * scale: scale parameter (real) *(>0)*

  Distribution over positive reals.

.. js:function:: Gaussian({mu: ..., sigma: ...})

  * mu: mean (real)
  * sigma: standard deviation (real) *(>0)*

  Distribution over reals.

.. js:function:: GaussianDrift({mu: ..., sigma: ...})

  * mu: mean (real)
  * sigma: standard deviation (real) *(>0)*

  Drift version of Gaussian. Drift kernels are used to narrow search during inference. Currently, the parameters guiding this narrowing are hard-coded.

.. js:function:: LogisticNormal({mu: ..., sigma: ...})

  * mu: vector of means
  * sigma: vector of standard deviations *(>0)*

  A distribution over probability vectors obtained by transforming a random variable drawn from ``DiagCovGaussian({mu: mu, sigma: sigma})``. If ``mu`` has length d then the distribution is over probability vectors of length d+1, i.e. the d dimensional simplex.

.. js:function:: Multinomial({ps: ..., n: ...})

  * ps: probabilities (array of reals that sum to 1) *(in [0,1])*
  * n: number of trials (integer > 0)

  Distribution over counts for n independent ``Discrete({ps: ps})`` trials

.. js:function:: MultivariateBernoulli({ps: ...})

  * ps: probabilities *(in [0,1])*

  Distribution over a vector of independent Bernoulli variables. Each element of the vector takes on a value in ``{0, 1}``. Note that this differs from ``Bernoulli`` which has support ``{true, false}``.

.. js:function:: MultivariateGaussian({mu: ..., cov: ...})

  * mu: mean vector (array of reals)
  * cov: covariance matrix  (array of array of reals that must be symmetric positive semidefinite)

  n-dimensional Gaussian.

.. js:function:: Poisson({mu: ...})

  * mu: mean (real) *(>0)*

  Distribution over integers.

.. js:function:: RandomInteger({n: ...})

  * n: number of possible values (integer >= 1)

  Uniform distribution on {0,1,...,n-1}

.. js:function:: TensorGaussian({mu: ..., sigma: ..., dims: ...})

  * mu: mean
  * sigma: standard deviation *(>0)*
  * dims: dimension of tensor

  Distribution over a tensor of independent Gaussian variables.

.. js:function:: Uniform({a: ..., b: ...})

  * a: lower bound (real)
  * b: upper bound (real > a)

  Continuous uniform distribution on [a, b]

.. js:function:: UniformDrift({a: ..., b: ..., r: ...})

  * a: lower bound (real)
  * b: upper bound (real > a)
  * r: drift kernel radius

  Drift version of Uniform. Drift kernels are used to narrow search during inference. UniformDrift proposes from a symmetric window around the current value x, [x-r, x+r]

