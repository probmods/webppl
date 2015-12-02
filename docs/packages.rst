WebPPL Packages
===============

WebPPL packages are regular Node.js packages optionally extended to
include WebPPL code, macros and headers.

To make a package available in your program use the ``--require``
argument::

    webppl myFile.wppl --require myPackage

WebPPL will search the following locations for packages:

1. The ``node_modules`` directory within the directory in which your
   program is stored.
2. The ``.webppl/node_modules`` directory within your home directory.
   Packages can be installed into this directory with
   ``npm install --prefix ~/.webppl myPackage``.

Packages can be loaded from other locations by passing a path::

    webppl myFile.wppl --require ../myPackage

Packages can extend WebPPL in several ways:

WebPPL code
-----------

You can automatically prepend WebPPL files to your code by added a
``wppl`` entry to ``package.json``. For example::

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

Macros
------

`sweet.js`_ modules can be included in a package as follows:

1. Add a file containing the macros to the package::

    // macros.sjs
    macro m { /* ... */ }
    export m;

Note that macros must be exported explicitly using the ``export``
keyword. See the `sweet.js module documentation`_ for further details.

2. Add a ``macros`` entry to ``package.json``::

    {
      "name": "my-package",
      "webppl": {
        "macros": ["macros.sjs"]
      }
    }

These macros will be visible to the WebPPL program which is been run
or compiled, and to any WebPPL code within the same package. They will
not be visible to WebPPL code in other packages.

Javascript functions and libraries
----------------------------------

Any regular Javascript code within a package is made available in WebPPL
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

If your Javascript isn’t in an ``index.js`` file in the root of the
package, you should indicate the entry point to your package by adding a
``main`` entry to ``package.json``. For example::

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

1. Write a Javascript file that exports a function. The function will be
   called with the ``env`` container and should return an object
   containing the functions you want to use::

       // addressHeader.js

       module.exports = function(env) {

         function myGetAddress(store, k, address) {
           return k(store, address);
         };

         return { myGetAddress: myGetAddress };

       };

2. Add a ``headers`` entry to ``package.json``::

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

.. _sweet.js: http://sweetjs.org
.. _sweet.js module documentation: http://sweetjs.org/doc/main/sweet.html#using-modules
.. _WebPPL package template: https://github.com/probmods/webppl-package-template
