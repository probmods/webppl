Workflow
========

Committing changes
------------------

Before committing changes, run grunt (which runs `tests`_ and
`linting`_)::

    grunt

If grunt doesn’t succeed, the `continuous integration tests`_ will fail
as well.

Modifying .ad.js files
----------------------

Files with names which end with ``.ad.js`` are transformed to use AD
primitives when WebPPL is installed.

During development it is necessary to run this transform after any
such files have been modified. A grunt task is provided that will
monitor the file system and run the transform when any ``.ad.js``
files are updated. Start the task with::

    grunt build-watch

Alternatively, the transform can be run directly with::

    grunt build

The scope of the transform is controlled with the ``'use ad'``
directive. If this directive appears directly after the ``'use
strict'`` directive at the top of a file, then the whole file will be
transformed. Otherwise, those functions which include the directive
before any other statements or expressions in their body will be
transformed. Any function nested within a function which includes the
directive will also be transformed.

Tests
-----

To only run the tests, do::

    npm test

To reproduce intermittent test failures run the inference tests with
the random seed displayed in the test output. For example::

    RANDOM_SEED=2344512342 nodeunit tests/test-inference.js

nodeunit can also run individual tests or test groups. For example::

    nodeunit tests/test-inference.js -t Enumerate

See the `nodeunit documentation`_ for details.

Linting
-------

To only run the linter::

    grunt gjslint

For more semantic linting, try::

    grunt hint

If gjslint complains about style errors (like indentation), you can fix
many of them automatically using::

    grunt fixjsstyle

Browser version
---------------

To generate a version of webppl for in-browser use, run::

    npm install -g browserify uglifyjs
    grunt bundle

The output is written to ``bundle/webppl.js`` and a minified version
is written to ``bundle/webppl.min.js``.

Testing
^^^^^^^

To check that compilation was successful, run the browser tests
using::

    grunt test-browser

The tests will run in the default browser. Specify a different browser
using the ``BROWSER`` environment variable. For example::

    BROWSER="Google Chrome" grunt test-browser

Incremental Compilation
^^^^^^^^^^^^^^^^^^^^^^^

Repeatedly making changes to the code and then testing the changes in
the browser can be a slow process. `watchify`_ speeds up this process
by performing an incremental compile whenever it detects changes to
source files. To start `watchify`_ use::

    npm install -g watchify
    grunt browserify-watch

Note that this task only updates ``bundle/webppl.js``. Before running
the browser tests and deploying, create the minified version like so::

    grunt uglify

Packages
^^^^^^^^

Packages can also be used in the browser. For example, to include the
``webppl-viz`` package use::

    grunt bundle:path/to/webppl-viz

Multiple packages can specified, separated by colons.

.. _continuous integration tests: https://travis-ci.org/probmods/webppl
.. _nodeunit documentation: https://github.com/caolan/nodeunit#command-line-options
.. _watchify: https://github.com/substack/watchify
