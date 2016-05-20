The WebPPL Language
=========

The WebPPL language begins with a subset of Javascript, and adds to it primitive distributions and primitives to sample, Infer, etc.

Following the notation from the [Mozilla Parser API](https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API), the language consists of the subset of Javascript that can be built from the following syntax elements, each shown with an `example`:

- *Program* - a complete program, consisting of a sequence of statements
- *BlockStatement* - a sequence of statements surrounded by braces, `{ var x=1; var y=2; }`
- *ExpressionStatement* - a statement containing a single expression, `3 + 4;`
- *ReturnStatement* - `return 3;`
- *EmptyStatement* - a solitary semicolon: `;`
- *IfStatement* - `if (x > 1) { return 1; } else { return 2; }`
- *VariableDeclaration* - `var x = 5;`
- *Identifier* - `x`
- *Literal* - `3`
- *FunctionExpression* - `function (x) { return x; }`
- *CallExpression* - `f(x)`
- *ConditionalExpression* - `x ? y : z`
- *ArrayExpression* - `[1, 2, 3]`
- *MemberExpression* - `Math.log`
- *BinaryExpression* - `3 + 4`
- *LogicalExpression* - `true || false`
- *UnaryExpression* - `-5`
- *ObjectExpression* - `{a: 1, b: 2}` (currently object properties cannot be functions)
- `global` *AssignmentExpression* - `globalStore.a = 1`

Note that assignment (*AssignmentExpression*) is currently only supported for the `globalStore object`, and no looping constructs are currently supported (e.g., `for`, `while`, `do`). This is because a purely functional language is much easier to transform into Continuation-Passing Style (CPS), which the WebPPL implementation uses to implement inference algorithms such as Enumeration and Particle Filtering.
While these restrictions mean that common Javascript programming patterns aren't possible, this subset is still universal, because we allow recursive and higher-order functions. It encourages a functional style, similar to Haskell or LISP, that is pretty easy to use (once you get used to thinking functionally!).

Distributions, sampling, factor, inference
---------

WebPPL provides a number of primitive distribution constructors, such as `Bernoulli`, which take a parameters object and return a distribution object: `var dist = Bernoulli()`. See [Distributions] for a list.

To describe generative processes, distribution objects can be sampled from via `sample(dist)`.

To control the implicit distribution over executions of a generative model, WebPPL provides `factor(score)`. Derived from `factor` is `condition(bool)`. (TODO: describe this better.... do we have condition and observe in the header?)

Marginal inference is accomplished by applying `Infer(params,model)` to a generative model represented as a function with no arguments. See [Inference].



Using Javascript libraries
---------

Functions from the Javascript environment that WebPPL is called from can be used in a WebPPL program, with a few restrictions. First, these external functions must be deterministic and cannot carry state from one call to another. (That is, the functions must be 'referentially transparent': calling obj.foo(args) must always return the same value when called with given arguments.) Second, external functions can't be called with a WebPPL function as an argument (that is, they can't be higher-order). Third, external functions must be invoked as the method of an object (indeed, this is the only use of object method invocation currently possible in WebPPL). So the use of `Math.log()` in the above example is allowed: it is a deterministic function invoked as a method of the `Math` object (which is a standard object in the Javascript global environment).

(note: some of this should move to, or be about packages??)

Example
--------

Here is a (very boring) program that uses much of the available syntax:

~~~~
var foo = function(x) {
  var bar = Math.exp(x)
  var baz =  x==0 ? [] : [Math.log(bar), foo(x-1)]
  return baz
}

foo(5)
~~~~



Deviations from Javascript
-----------

This section documents a few common "gotchas" for those familiar with Javascript.
