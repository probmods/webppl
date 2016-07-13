Quick start
===========

Installation 
------------

webppl is written in JavaScript, and requires `Node.js <http://nodejs.org>`_ to run. After you can install Node, you can use npm (**n**\ ode **p**\ ackage **m**\ anager) to install webppl::

    npm install -g webppl

Create a file called "test.wppl"::

    var greeting = function () {
        return flip(.5) ? "Hello" : "Howdy"
    }
    
    var audience = function () {
        return flip(.5) ? "World" : "Universe"
    }
    
    var phrase = greeting() + ", " + audience() + "!"
    
    return phrase

Run it with this command::

    webppl test.wppl

Learning
--------

If you're new to probabilistic programming, `Probabilistic Models of Cognition <https://probmods.org/>`_ is a great place to start. It uses Church for demonstrations, but the principles will apply when you are using webppl.

The best guide to using webppl is `The Design and Implementation of Probabilistic Programming Languages <http://dippl.org/chapters/02-webppl.html>`_. Our `examples <https://github.com/probmods/webppl/tree/master/examples>`_ will also be helpful lin learning the syntax.

Need help?
----------

If you have any questions about installing webppl or need help with your program, you can get help on `the Google group <https://groups.google.com/forum/#!forum/webppl-dev>`_.

Updating webppl
---------------

webppl is under active development. To update webppl, run::

    npm update -g webppl
