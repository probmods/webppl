Distributions
=============

.. js:function:: Bernoulli({p: ...})

  * p: probability of true *(in [0,1])*

  Distribution on {true,false}

.. js:function:: Beta({a: ..., b: ...})

  * a:  *(>0)*
  * b:  *(>0)*

.. js:function:: Binomial({p: ..., n: ...})

  * p: success probability *(in [0,1])*
  * n: number of trials

  Distribution over the number of successes for n independent ``Bernoulli({p: p})`` trials

.. js:function:: Categorical({ps: ..., vs: ...})

  * ps: array of probabilities *(in [0,1])*
  * vs: support

  Distribution over elements of vs with P(vs[i]) = ps[i]

.. js:function:: Cauchy({location: ..., scale: ...})

  * location: 
  * scale:  *(>0)*

.. js:function:: Delta({v: ...})

  * v: support element

  Discrete distribution that assigns probability one to the single element in its support. This is only useful in special circumstances as sampling from ``Delta({v: val})`` can be replaced with ``val`` itself. Furthermore, a ``Delta`` distribution parameterized by a random choice should not be used with MCMC based inference, as doing so produces incorrect results.

.. js:function:: DiagCovGaussian({mu: ..., sigma: ...})

  * mu: vector of means
  * sigma: vector of standard deviations *(>0)*

  Multivariate Gaussian distribution with diagonal covariance matrix.

.. js:function:: Dirichlet({alpha: ...})

  * alpha: vector of concentration parameters *(>0)*

.. js:function:: DirichletDrift({alpha: ...})

  * alpha: vector of concentration parameters *(>0)*

.. js:function:: Discrete({ps: ...})

  * ps: array or vector of probabilities *(in [0,1])*

  Distribution on {0,1,...,ps.length-1} with P(i) proportional to ps[i]

.. js:function:: Exponential({a: ...})

  * a: rate *(>0)*

.. js:function:: Gamma({shape: ..., scale: ...})

  * shape:  *(>0)*
  * scale:  *(>0)*

.. js:function:: Gaussian({mu: ..., sigma: ...})

  * mu: mean
  * sigma: standard deviation *(>0)*

.. js:function:: GaussianDrift({mu: ..., sigma: ...})

  * mu: mean
  * sigma: standard deviation *(>0)*

.. js:function:: LogisticNormal({mu: ..., sigma: ...})

  * mu: vector of means
  * sigma: vector of standard deviations *(>0)*

  A distribution over probability vectors obtained by transforming a random variable drawn from ``DiagCovGaussian({mu: mu, sigma: sigma})``. If ``mu`` has length d then the distribution is over probability vectors of length d+1, i.e. the d dimensional simplex.

.. js:function:: Multinomial({ps: ..., n: ...})

  * ps: probabilities *(in [0,1])*
  * n: number of trials

  Distribution over counts for n independent ``Discrete({ps: ps})`` trials

.. js:function:: MultivariateBernoulli({ps: ...})

  * ps: probabilities *(in [0,1])*

  Distribution over a vector of independent Bernoulli variables. Each element of the vector takes on a value in ``{0, 1}``. Note that this differs from ``Bernoulli`` which has support ``{true, false}``.

.. js:function:: MultivariateGaussian({mu: ..., cov: ...})

  * mu: mean vector
  * cov: covariance matrix

.. js:function:: Poisson({mu: ...})

  * mu:  *(>0)*

.. js:function:: RandomInteger({n: ...})

  * n: 

  Uniform distribution on {0,1,...,n-1}

.. js:function:: TensorGaussian({mu: ..., sigma: ..., dims: ...})

  * mu: mean
  * sigma: standard deviation *(>0)*
  * dims: dimension of tensor

  Distribution over a tensor of independent Gaussian variables.

.. js:function:: Uniform({a: ..., b: ...})

  * a: 
  * b: 

  Continuous uniform distribution on [a, b]

.. js:function:: UniformDrift({a: ..., b: ..., r: ...})

  * a: 
  * b: 
  * r: drift kernel radius

