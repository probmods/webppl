Tensors
=======

Creation
--------

.. js:function:: Vector(arr)

   :param array arr: array of values

   Creates a tensor with dimension ``[m, 1]``, where ``m`` is the
   length of ``arr``.

   Example::

     Vector([1, 2, 3])

.. js:function:: Matrix(arr)

   :param array arr: array of arrays of values

   Creates a tensor with dimension ``[m, n]``, where ``m`` is the
   length of ``arr`` and ``n`` is the length of ``arr[0]``.

   Example::

     Matrix([[1, 2], [3, 4]])

.. js:function:: Tensor(dims, arr)

   :param array dims: array of dimension sizes
   :param array arr: array of values

   Creates a tensor with dimension ``dims`` out of a flat array ``arr``.

   Example::

     Tensor([2, 2, 2], [1, 2, 3, 4, 5, 6, 7, 8])

.. js:function:: zeros(dims)

   :param array dims: dimension of tensor

   Creates a tensor with dimension ``dims`` and all elements equal to
   zero.

   Example::

     zeros([10, 1])

.. js:function:: ones(dims)

   :param array dims: dimension of tensor

   Creates a tensor with dimension ``dims`` and all elements equal to
   one.

   Example::

     ones([10, 1])

.. js:function:: idMatrix(n)

   Returns the ``n`` by ``n`` identity matrix.

.. js:function:: oneHot(k, n)

   Returns a vector of length ``n`` in which the ``k`` :sup:`th` entry
   is one and all other entries are zero.

Operations
----------

WebPPL inherits its Tensor functionality from `adnn <https://github.com/dritchie/adnn>`_. It supports all of the tensor functions documented `here <https://github.com/dritchie/adnn/blob/master/ad/README.md#available-ad-primitive-functions>`_. Specifically, the ``ad.tensor`` module (and all the functions it contains) are globally available in WebPPL. For convenience, WebPPL also aliases ``ad.tensor`` to ``T``, so you can write things like::

    var x = T.transpose(Vector([1, 2, 3])); // instead of ad.tensor.transpose
    var y = Vector([3, 4, 5]);
    T.dot(x, y); // instead of ad.tensor.dot

Other
-----

.. js:function:: dims(tensor)

   Returns the shape of ``tensor``.

   ::

     dims(ones([3, 2])) // => [3, 2]

.. js:function:: concat(arr)

   Returns the vector obtained by concatenating array of vectors
   ``arr``.

   ::

     concat([Vector([1, 2]), Vector([3, 4])]) // => Vector([1, 2, 3, 4])
