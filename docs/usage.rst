Usage
=====

Running webppl programs::

    webppl examples/geometric.wppl

Seeding the random number generator::

    webppl examples/lda.wppl --random-seed 2344512342

Compiling webppl programs to Javascript::

    webppl examples/geometric.wppl --compile --out geometric.js

The compiled file can be run using nodejs::

    node geometric.js

To use webppl in web pages, include the `browser bundle
<development/workflow.html#browser-version>`_::

    <script src="webppl.js"></script>
    <script>webppl.run(...)</script>

We also provide an in-browser editor for webppl code. See the documentation for webppl-editor_

.. _webppl-editor: https://github.com/probmods/webppl-editor
