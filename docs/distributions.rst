Distributions
=============

.. js:function:: Bernoulli({p: ...})

  * p: *probability of true*

  Distribution on {true,false}

.. js:function:: Beta({a: ..., b: ...})

  * a
  * b

.. js:function:: Binomial({p: ..., n: ...})

  * p: *success probability*
  * n: *number of trials*

  Distribution over the number of successes for n independent ``Bernoulli({p: p})`` trials

.. js:function:: Categorical({ps: ..., vs: ...})

  * ps: *array of probabilities*
  * vs: *support*

  Distribution over elements of vs with P(vs[i]) = ps[i]

.. js:function:: Cauchy({location: ..., scale: ...})

  * location
  * scale

.. js:function:: Delta({v: ...})

  * v: *support element*

  Discrete distribution that assigns probability one to the single element in its support. This is only useful in special circumstances as sampling from ``Delta({v: val})`` can be replaced with ``val`` itself. Furthermore, a ``Delta`` distribution parameterized by a random choice should not be used with MCMC based inference, as doing so produces incorrect results.

.. js:function:: DiagCovGaussian({mu: ..., sigma: ...})

  * mu: *vector of means*
  * sigma: *vector of standard deviations*

  Multivariate Gaussian distribution with diagonal covariance matrix.

.. js:function:: Dirichlet({alpha: ...})

  * alpha: *vector of concentration parameters*

.. js:function:: DirichletDrift({alpha: ...})

  * alpha: *array of concentration parameters*

.. js:function:: Discrete({ps: ...})

  * ps: *array or vector of probabilities*

  Distribution on {0,1,...,ps.length-1} with P(i) proportional to ps[i]

.. js:function:: Exponential({a: ...})

  * a: *rate*

.. js:function:: Gamma({shape: ..., scale: ...})

  * shape
  * scale

.. js:function:: Gaussian({mu: ..., sigma: ...})

  * mu: *mean*
  * sigma: *standard deviation*

.. js:function:: GaussianDrift({mu: ..., sigma: ...})

  * mu: *mean*
  * sigma: *standard deviation*

.. js:function:: LogisticNormal({mu: ..., sigma: ...})

  * mu
  * sigma

.. js:function:: Multinomial({ps: ..., n: ...})

  * ps: *probabilities*
  * n: *number of trials*

  Distribution over counts for n independent ``Discrete({ps: ps})`` trials

.. js:function:: MultivariateBernoulli({ps: ...})

  * ps: *probabilities*

  Distribution over a vector of independent Bernoulli variables. Each element of the vector takes on a value in ``{0, 1}``. Note that this differs from ``Bernoulli`` which has support ``{true, false}``.

.. js:function:: MultivariateGaussian({mu: ..., cov: ...})

  * mu: *mean vector*
  * cov: *covariance matrix*

.. js:function:: Poisson({mu: ...})

  * mu

.. js:function:: RandomInteger({n: ...})

  * n

  Uniform distribution on {0,1,...,n-1}

.. js:function:: TensorGaussian({mu: ..., sigma: ..., dims: ...})

  * mu: *mean*
  * sigma: *standard deviation*
  * dims: *dimension of tensor*

  Distribution over a tensor of independent Gaussian variables.

.. js:function:: Uniform({a: ..., b: ...})

  * a
  * b

  Continuous uniform distribution on [a, b]

.. js:function:: UniformDrift({a: ..., b: ..., r: ...})

  * a
  * b
  * r: *drift kernel radius*

