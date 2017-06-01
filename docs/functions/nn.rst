Neural networks
===============

In WebPPL neural networks can be represented as simple
:ref:`parameterized <parameters>` functions. The language includes a
number of helper functions that capture common patterns in the shape
of these functions. These helpers typically take a name and the
desired input and output dimensions of the network as arguments. For
example::


  var net = affine('net', {in: 3, out: 5});
  var out = net(ones([3, 1])); // dims(out) == [5, 1]

Larger networks are built with ordinary function composition. The
:js:func:`stack` helper provides a convenient way of composing
multiple layers::

  var mlp = stack([
    sigmoid,
    affine('layer2', {in: 5, out: 1}),
    tanh,
    affine('layer1', {in: 5, out: 5})
  ]);

It's important to note that the parameters of these functions are
created when the constructor function (e.g. :js:func:`affine`) is
called. As a consequence, models should be written such that
constructors are called on every evaluation of the model. If a
constructor is instead called only once before ``Infer`` or
``Optimize`` is called, then the parameters of the network will not be
optimized.

::

   // Correct
   var model = function() {
     var net = affine('net', opts);
     /* use net */
   };
   Infer({model: model, /* options */});

   // Incorrect
   var net = affine('net', opts);
   var model = function() {
     /* use net */
   };
   Infer({model: model, /* options */});

Feed forward
------------

.. js:function:: affine(name, {in, out[, param, init, initb]})

   Returns a parameterized function of a single argument that performs
   an affine transform of its input. This function maps a vector of
   length ``in`` to a vector of length ``out``.

   By default, the weight and bias parameters are created using the
   :js:func:`param` method. An alternative method (e.g.
   :js:func:`modelParam`) can be specified using the ``param`` option.

   The ``init`` option can be used to specify how the weight matrix is
   initialized. It accepts a function that takes the shape of the
   matrix as its argument and returns a matrix of that shape. When the
   ``init`` option is omitted `Xavier initialization
   <http://proceedings.mlr.press/v9/glorot10a/glorot10a.pdf>`_ is
   used.

   The ``initb`` argument specifies the value with which each element
   of the bias vector is initialized. The default is ``0``.

   Example usage::

     var init = function(dims) {
       return idMatrix(dims[0]);
     };
     var net = affine('net', {in: 10, out: 10, init: init, initb: -1});
     var output = net(input);

Recurrent
---------

These functions return a parameterized function of two arguments that
maps a state vector of length ``hdim`` and an input vector of length
``xdim`` to a new state vector. Each application of this function
computes a single step of a recurrent network.

.. js:function:: rnn(name, {hdim, xdim, [, param, output]})

   Implements a vanilla RNN. By default the new state vector is passed
   through the ``tanh`` function before it is returned. The ``output``
   option can be used to specify an alternative output function.

.. js:function:: gru(name, {hdim, xdim, [, param]})

   Implements a gated recurrent unit. This is similar to the variant
   described in `Empirical Evaluation of Gated Recurrent Neural
   Networks on Sequence Modeling <https://arxiv.org/abs/1412.3555>`_.

.. js:function:: lstm(name, {hdim, xdim, [, param]})

   Implements a long short term memory. This is similar to the variant
   described in `Generating sequences with recurrent neural networks
   <https://arxiv.org/abs/1308.0850>`_. The difference is that here
   there are no peep-hole connections. i.e. The previous memory state
   is not passed as input to the forget, input, or output gates.

Nonlinear functions
-------------------

Some nonlinear functions commonly used when building networks. Each is
applied element-wise to its argument.

.. js:function:: sigmoid(tensor)
.. js:function:: tanh(tensor)
.. js:function:: relu(tensor)
.. js:function:: softplus(tensor)
.. js:function:: softmax(tensor)

Other
-----

.. js:function:: stack(fns)

   Returns the composition of the array of functions ``fns``. The
   composite function applies the functions in ``fns`` in reverse
   order. That is::

     stack([g, f]) == function(x) { return g(f(x)); }
