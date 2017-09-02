Language Overview
=================

The WebPPL language begins with a subset of JavaScript, and adds to it
:ref:`primitive distributions <primitive-distributions>` and
operations to perform :ref:`sampling <sample>`, :ref:`conditioning
<conditioning>` and :ref:`inference <inference>`.

Syntax
------

Following the notation from the `Mozilla Parser API
<https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API>`_,
the language consists of the subset of JavaScript that can be built
from the following syntax elements, each shown with an ``example``:

===================== ====
Element               Example
===================== ====
Program               A complete program, consisting of a sequence of statements
BlockStatement        A sequence of statements surrounded by braces, ``{var x = 1; var y = 2;}``
ExpressionStatement   A statement containing a single expression, ``3 + 4;``
ReturnStatement       ``return 3;``
EmptyStatement        A solitary semicolon, ``;``
IfStatement           ``if (x > 1) { return 1; } else { return 2; }``
VariableDeclaration   ``var x = 5;``
Identifier            ``x``
Literal               ``3``
FunctionExpression    ``function (x) { return x; }``
CallExpression        ``f(x)``
ConditionalExpression ``x ? y : z``
ArrayExpression       ``[1, 2, 3]``
MemberExpression      ``Math.log``
BinaryExpression      ``3 + 4``
LogicalExpression     ``true || false``
UnaryExpression       ``-5``
ObjectExpression      ``{a: 1, b: 2}``
AssignmentExpression  ``globalStore.a = 1`` (Assignment is only supported by the :ref:`global store <globalstore>`.)
===================== ====

Note that general assignment expressions and looping constructs are
not currently supported (e.g. ``for``, ``while``, ``do``). This is
because a purely functional language is much easier to transform into
Continuation-Passing Style (CPS), which the `WebPPL implementation
<http://dippl.org>`_ uses to implement inference algorithms such as
:ref:`enumeration <enumerate>` and :ref:`SMC <smc>`. While these
restrictions mean that common JavaScript programming patterns aren't
possible, this subset is still universal, because we allow recursive
and higher-order functions. It encourages a functional style, similar
to Haskell or LISP, that is pretty easy to use (once you get used to
thinking functionally!).

Here is a (very boring) program that uses much of the available
syntax::

  var foo = function(x) {
    var bar = Math.exp(x);
    var baz = x === 0 ? [] : [Math.log(bar), foo(x-1)];
    return baz;
  }

  foo(5);

Calling JavaScript Functions
----------------------------

JavaScript functions can be called from a WebPPL program, with a few
restrictions:

1. JavaScript functions must be deterministic and cannot carry state
   from one call to another. (That is, the functions must be
   'referentially transparent': calling ``obj.foo(args)`` must always
   return the same value when called with given arguments.)

2. JavaScript functions can't be called with a WebPPL function as an
   argument (that is, they can't be higher-order).

3. JavaScript functions must be invoked as the method of an object
   (indeed, this is the only use of object method invocation currently
   possible in WebPPL).

All of the JavaScript functions built into the environment in which
WebPPL is running are automatically available for use. Additional
functions can be added to the environment through the use of
:ref:`packages <packages>`.

Note that since JavaScript functions must be called as methods on an
object, it is not possible to call global JavaScript functions such as
``parseInt()`` directly. Instead, such functions should be called as
methods on the built-in object ``_top``. e.g. ``_top.parseInt('0')``.
