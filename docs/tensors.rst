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

Arithmetic
----------

The following functions operate element-wise. The functions with two
parameters accept either a tensor or a scalar as their second
argument.

.. js:function:: T.add(x, y)

   :param tensor x:
   :param tensor y:

   Element-wise addition.

.. js:function:: T.sub(x, y)

   :param tensor x:
   :param tensor y:

   Element-wise subtraction.

.. js:function:: T.mul(x, y)

   :param tensor x:
   :param tensor y:

   Element-wise multiplication.

.. js:function:: T.div(x, y)

   :param tensor x:
   :param tensor y:

   Element-wise division.

.. js:function:: T.neg(x)

   :param tensor x:

   Element-wise negation.

Linear algebra
--------------

.. js:function:: T.dot(x, y)

   :param matrix x:
   :param matrix y:

   Matrix multiplication.

Indexing
--------

.. js:function:: T.range(x, start, end)

   :param tensor x:
   :param integer start:
   :param integer end:

.. js:function:: T.get(x, index)

   :param tensor x:
   :param integer index:

Reshaping
---------

.. js:function:: T.transpose(x)

   :param matrix x:

   Matrix transpose.
