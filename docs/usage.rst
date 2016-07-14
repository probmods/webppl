Usage
=====

Running WebPPL programs::

    webppl examples/geometric.wppl

Seeding the random number generator::

    webppl examples/lda.wppl --random-seed 2344512342

Compiling WebPPL programs to JavaScript::

    webppl examples/geometric.wppl --compile --out geometric.js

The compiled file can be run using nodejs::

    node geometric.js

To use WebPPL in web pages, include the `browser bundle
<development/workflow.html#browser-version>`_::

    <script src="webppl.js"></script>
    <script>webppl.run(...)</script>

We also provide an in-browser editor for WebPPL code. See the documentation for webppl-editor_

.. _webppl-editor: https://github.com/probmods/webppl-editor
