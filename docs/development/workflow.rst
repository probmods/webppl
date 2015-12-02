Workflow
========

Before committing changes, run grunt (which runs tests and linting)::

    grunt

If grunt doesn’t succeed, the `continuous integration tests`_ will fail
as well.

To only run the tests, do::

    npm test

To reproduce intermittent test failures run the inference tests with
the random seed displayed in the test output. For example::

    RANDOM_SEED=2344512342 nodeunit tests/test-inference.js

nodeunit can also run individual tests or test groups. For example::

    nodeunit tests/test-inference.js -t Enumerate

See the `nodeunit documentation`_ for details.

To only run the linter::

    grunt gjslint

For more semantic linting, try::

    grunt hint

If gjslint complains about style errors (like indentation), you can fix
many of them automatically using::

    grunt fixjsstyle

To compile webppl for use in browser, run::

    npm install -g browserify uglifyjs
    grunt compile

Then, to run the browser tests use::

    grunt test-browser

The tests will run in the default browser. Specify a different browser
using the ``BROWSER`` environment variable. For example::

    BROWSER="Google Chrome" grunt test-browser

Packages can also be used in the browser. For example, to include the
``webppl-viz`` package use::

    grunt compile:path/to/webppl-viz

Multiple packages can specified, separated by colons.

.. _continuous integration tests: https://travis-ci.org/probmods/webppl
.. _nodeunit documentation: https://github.com/caolan/nodeunit#command-line-options
