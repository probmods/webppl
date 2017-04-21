Usage
=====

.. highlight:: none

Running WebPPL programs::

    webppl examples/geometric.wppl

Arguments
---------

Seeding the random number generator::

    webppl examples/lda.wppl --random-seed 2344512342

Compiling WebPPL programs to JavaScript::

    webppl examples/geometric.wppl --compile --out geometric.js

The compiled file can be run using nodejs::

    node geometric.js

Passing arguments to the program
--------------------------------

Command line arguments can be passed through to the WebPPL program by
placing them after a single ``--`` argument. Such arguments are parsed
(with `minimist <https://www.npmjs.com/package/minimist>`_) and the
result is bound to the global variable ``argv``.

For example, this program::

  display(argv);

When run with::

  webppl model.wppl -- --my-flag --my-num 100 --my-str hello

Will produce the following output::

  { _: ['model.wppl'], 'my-flag': true, 'my-num': 100, 'my-str': 'hello' }
