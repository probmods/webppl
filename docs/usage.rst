Usage
=====

Running webppl programs::

    webppl examples/geometric.wppl

Seeding the random number generator::

    RANDOM_SEED=2344512342 webppl examples/lda.wppl

Compiling webppl programs to Javascript::

    webppl examples/geometric.wppl --compile --out geometric.js

The compiled file can be run using nodejs::

    node geometric.js
