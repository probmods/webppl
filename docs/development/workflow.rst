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

    npm install -g browserify
    browserify -t brfs src/browser.js > compiled/webppl.js

Packages can also be used in the browser. For example, to include the
``webppl-viz`` package use::

    browserify -t [./src/bundle.js --require webppl-viz] -t brfs src/browser.js > compiled/webppl.js

Multiple ``--require`` arguments can be used to include multiple
packages.

.. _continuous integration tests: https://travis-ci.org/probmods/webppl
.. _nodeunit documentation: https://github.com/caolan/nodeunit#command-line-options
