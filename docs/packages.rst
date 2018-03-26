.. _packages:

Packages
========

WebPPL packages are regular Node.js packages optionally extended to
include WebPPL code and headers.

To make a package available in your program use the ``--require``
argument:

.. code-block:: none

    webppl myFile.wppl --require myPackage

WebPPL will search the following locations for packages:

1. The ``node_modules`` directory within the directory in which your
   program is stored.
2. The ``.webppl/node_modules`` directory within your home directory.
   Packages can be installed into this directory with
   ``npm install --prefix ~/.webppl myPackage``.

Packages can be loaded from other locations by passing a path:

.. code-block:: none

    webppl myFile.wppl --require ../myPackage

Packages can extend WebPPL in several ways:

WebPPL code
-----------

You can automatically prepend WebPPL files to your code by added a
``wppl`` entry to ``package.json``. For example:

.. code-block:: json

    {
      "name": "my-package",
      "webppl": {
        "wppl": ["myLibrary.wppl"]
      }
    }

The use of some inference algorithms causes a caching transform to be
applied to each ``wppl`` file. It is possible to skip the application
of this transform on a per-file basis by placing the ``no caching``
directive at the beginning of the file. For example::

    'no caching';

    // Rest of WebPPL program

This is expected to be useful in only a limited number of cases and
shouldn't be applied routinely.

JavaScript functions and libraries
----------------------------------

Any regular JavaScript code within a package is made available in WebPPL
as a global variable. The global variable takes the same name as the
package except when the package name includes one or more ``-``
characters. In such cases the name of the global variable is obtained by
converting the package name to camelCase.

For example, if the package ``my-package`` contains this file::

    // index.js
    module.exports = {
      myAdd: function(x, y) { return x + y; }
    };

Then the function ``myAdd`` will be available in WebPPL as
``myPackage.myAdd``.

If your JavaScript isn’t in an ``index.js`` file in the root of the
package, you should indicate the entry point to your package by adding a
``main`` entry to ``package.json``. For example:

.. code-block:: json

    {
      "name": "my-package",
      "main": "src/main.js"
    }

Note that packages must export functions as properties of an object.
Exporting functions directly will not work as expected.

Additional header files
-----------------------

Sometimes, it is useful to define external functions that are able to
access WebPPL internals. Header files have access to the following:

-  The store, continuation, and address arguments that are present at
   any point in a WebPPL program.
-  The ``env`` container which allows access to ``env.coroutine`` among
   other things.

Let’s use the example of a function that makes the current address
available in WebPPL:

1. Write a JavaScript file that exports a function. The function will be
   called with the ``env`` container and should return an object
   containing the functions you want to use::

       // addressHeader.js

       module.exports = function(env) {

         function myGetAddress(store, k, address) {
           return k(store, address);
         };

         return { myGetAddress: myGetAddress };

       };

2. Add a ``headers`` entry to ``package.json``:

.. code-block:: json

       {
         "name": "my-package",
         "webppl": {
           "headers": ["addressHeader.js"]
         }
       }

3. Write a WebPPL file that uses your new functions (without module qualifier)::

        // addressTest.wppl

        var foo = function() {
          var bar = function() {
            console.log(myGetAddress());
          }
          bar();
        };

        foo();

Package template
----------------

The `WebPPL package template`_ provides a scaffold that you can extend to create your own packages.

Useful packages
---------------

- `json`_: read/write json files
- `csv`_: read/write csv files
- `fs`_: read/write files in general
- `dp`_: dynamic programming (caching for mutually recursive functions)
- `editor`_: browser based editor
- `viz`_: visualization utilities
- `bda`_: data analysis utilities
- `agents`_: agent simulations
- `timeit`_: timing utilities
- `intercache`_: interpolating cache
- `oed`_: optimal experimental design

These packages are no longer maintained, but may be worth a look:

- `caches`_: cache inference results to disk
- `formal`_: static analysis in Racket for WebPPL
- `isosmc`_: utils for defining sequences of distributions for smc

.. _sweet.js: http://sweetjs.org
.. _sweet.js module documentation: http://sweetjs.org/doc/main/sweet.html#using-modules
.. _WebPPL package template: https://github.com/probmods/webppl-package-template
.. _json: https://github.com/stuhlmueller/webppl-json
.. _csv: https://github.com/mhtess/webppl-csv
.. _fs: https://github.com/null-a/webppl-fs
.. _dp: https://github.com/stuhlmueller/webppl-dp
.. _editor: https://github.com/probmods/webppl-editor
.. _viz: https://github.com/probmods/webppl-viz
.. _bda: https://github.com/mhtess/webppl-bda
.. _agents: https://github.com/agentmodels/webppl-agents
.. _timeit: https://github.com/stuhlmueller/webppl-timeit
.. _intercache: https://github.com/stuhlmueller/webppl-intercache
.. _oed: https://github.com/lydaniel/oed
.. _caches: https://github.com/iffsid/webppl-caches
.. _formal: https://github.com/kimmyg/webppl-formal
.. _isosmc: https://github.com/stuhlmueller/isosmc
