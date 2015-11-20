Workflow
========

Committing changes
------------------

Before committing changes, run grunt (which runs `tests`_ and
`linting`_)::

    grunt

If grunt doesn’t succeed, the `continuous integration tests`_ will fail
as well.

Modifying erp.ad.js
-------------------

During development, it is necessary to transform ``src/erp.ad.js``
after it has been modified by running::

    ./scripts/transformERP

This transforms ERP score functions in order to support automatic
differentiation using `ad.js <https://github.com/iffsid/ad.js>`_.

For performance reasons, not all code is transformed. All code
relating to computing scores should therefore be implemented as some
combination of the following:

* Named functions where the name ends with ``Score`` or ``AD``. e.g.
  ``function gaussianScore() {}``, ``function sumAD() {}``.
* Anonymous functions defined as the ``score`` property of an object
  literal. e.g. ``{ score: function() {} }``

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

Compiling for browser
---------------------

To compile webppl for use in browser, run::

    npm install -g browserify uglifyjs
    cd compiled
    make clean
    make

Then, to run the browser tests use::

    make test

The tests will run in the default browser. Specify a different browser
using the ``BROWSER`` environment variable. For example::

    BROWSER="Google Chrome" make test

Packages can also be used in the browser. For example, to include the
``webppl-viz`` package use::

    browserify -t [./src/bundle.js --require webppl-viz] -g brfs src/browser.js > compiled/webppl.js

Multiple ``--require`` arguments can be used to include multiple
packages.

.. _continuous integration tests: https://travis-ci.org/probmods/webppl
.. _nodeunit documentation: https://github.com/caolan/nodeunit#command-line-options
