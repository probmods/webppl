.. _globalstore:

The Global Store
================

Background
~~~~~~~~~~

The subset of JavaScript supported by WebPPL does not include general
assignment expressions. This means it is not possible to change the
value bound to a variable, or to modify the contents of a compound
data structure::


  var a = 0;
  a = 1; // won't work

  var b = {x: 0};
  b.x = 1; // won't work


Attempting to do either of these things (which we will collectively
refer to as 'assignment') generates an error.

This restriction isn't usually a problem as most of the things you
might like to write using assignment can be expressed conveniently in
a functional style.

However, assignment can occasionally be useful, and for this reason
WebPPL provides a limited form of it through something called the
global store.

Introducing the global store
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The global store is a built-in data structure with special status in
the language. It is available in all programs as ``globalStore``.

Unlike regular compound data structures in WebPPL its contents *can*
be modified. Here's a simple example::

  globalStore.x = 0; // assign
  globalStore.x = 1; // reassign
  globalStore.x += 1;
  display(globalStore.x) // prints 2

When reading and writing to the global store, it behaves like a plain
JavaScript object. As in JavaScript, the value of each property is
initially ``undefined``.

Note that while the store can be modified by assigning and reassigning
values to its properties, it is not possible to mutate compound data
structures referenced by those properties::

  globalStore.foo = {x: 0}
  globalStore.foo = {x: 1} // reassigning foo is ok

  globalStore.foo = {x: 0}
  globalStore.foo.x = 1 // attempting to mutate foo fails

Marginal inference and the global store
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Crucially, all marginal inference algorithms are aware of the global
store and take care to ensure that performing inference over code that
performs assignment produces correct results.

To see why this is important consider the following program::

  var model = function() {
    var x = uniformDraw([0, 1]);
    return x;
  };

The marginal distribution on return values for this program is::

  Infer({method: 'enumerate'}, model);

  // Marginal:
  //   0 : 0.5
  //   1 : 0.5

Now imagine re-writing this model using assignment::

  var model = function() {
    globalStore.x = 0;
    globalStore.x += uniformDraw([0, 1]);
    return globalStore.x;
  };

Intuitively, these programs should have the same marginal
distribution, and in fact they do in WebPPL. However, the way this
works is a little subtle.

To see why, let's see how inference in our simple model proceeds,
keeping track of the value in the global store as we go.

For this example we will perform marginal inference by
:ref:`enumeration <enumerate>` but something similar applies to all
inference strategies.

Marginal inference by enumeration works by exploring all execution
paths through the program. If the global store was shared across paths
then the above example would produce counter-intuitive results.

In our example, the first path taken through the program chooses ``1``
from the ``uniformDraw`` which looks something like::

  globalStore.x = 0;                    // {x: 0} <- state of the global store
  globalStore.x += uniformDraw([0, 1]); // {x: 1} choose 1, update store
  return globalStore.x;                 // Add 1 to the marginal distribution.

Next, we continue from the ``uniformDraw`` this time choosing ``0``::

  //                                   // {x: 1} carried over from previous execution
  globalStore.x += uniformDraw([0, 1]) // {x: 1} choose 0, updating store produces no change
  return globalStore.x;                // Add 1 to the marginal distribution

All paths have now been explored, but our marginal distribution only
includes ``1``!

The solution is have the global store be local to each execution, so
that assignment on one path is not visible from another. This is what
happens in WebPPL.

Another way to think about this is to view each execution path as a
possible world in a simulation. From this point of view the global
store is world local; it's not possible to reach into other worlds and
modify their state.

When to use the store
~~~~~~~~~~~~~~~~~~~~~

If you find yourself threading an argument through every function call
in your program, you might consider replacing this with a value in the
global store.

When not to use the global store
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Maintaining a store local to each execution as described above incurs
overhead.

For this reason, it is best not to use the store as a general
replacement for assignment as typically used in imperative programming
languages. Instead, it is usually preferable to express the program in
a functional style.

Consider for example the case of concatenating an array of strings.
Rather than accumulating the result in the global store::

  var f = function() {
    var names = ['alice', 'bob'];
    globalStore.out = '';
    map(function(name) { globalStore.out += name; }, names);
    return globalStore.out;
  };

It is *much* better to use ``reduce`` to achieve the same result::

  var f = function() {
    var names = ['alice', 'bob'];
    return reduce(function(acc, name) { return acc + name; }, '', names);
  };
