Usage
=====

.. highlight:: none

Running WebPPL programs::

    webppl examples/geometric.wppl

Seeding the random number generator::

    webppl examples/lda.wppl --random-seed 2344512342

Compiling WebPPL programs to JavaScript::

    webppl examples/geometric.wppl --compile --out geometric.js

The compiled file can be run using nodejs::

    node geometric.js
