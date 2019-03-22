.. _installation:

Installation
============

First, install `git <https://git-scm.com/downloads>`_.

Second, install `Node.js <http://nodejs.org>`_. WebPPL is written in
JavaScript, and requires Node to run. After it is installed, you can
use npm (**n**\ ode **p**\ ackage **m**\ anager) to install WebPPL::

    npm install -g webppl

Create a file called ``test.wppl``::

    var greeting = function () {
        return flip(.5) ? "Hello" : "Howdy"
    }

    var audience = function () {
        return flip(.5) ? "World" : "Universe"
    }

    var phrase = greeting() + ", " + audience() + "!"

    phrase

Run it with this command::

    webppl test.wppl

Updating
--------

WebPPL is in active development. To update WebPPL, run::

    npm update -g webppl

From GitHub
-----------

WebPPL can also be installed directly from GitHub. This is typically
only necessary in order to work on the development of WebPPL itself.
See the :ref:`development documentation <installation_from_source>`
for details.
