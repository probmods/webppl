Debugging
=========

WebPPL provides error messages that try to be informative.
In addition there is debugging software you can use for WebPPL programs.

To debug WebPPL programs running in Chrome, enable `pause on JavaScript
exceptions`_ in the Chrome debugger.

To debug WebPPL programs running in nodejs, use node debugger as
follows:

1. Add ``debugger;`` statements to ``my-program.wppl`` to indicate breakpoints.

2. Run your compiled program in debug mode::

     node debug path/to/webppl my-program.wppl

   Note that you will need the full path to the ``webppl`` executable.
   This might be in the ``lib`` folder of your ``node`` directory if
   you installed with ``npm``. On many systems you can avoid entering
   the path manually by using the following command::

     node debug `which webppl` my-program.wppl

3. To navigate to your breakpoint within the debugger interface, type
   ``cont`` or ``c``.
   At any break point, you can type ``repl`` to interact with the
   variables.
   `Here`_'s some documentation for this debugger.

.. _pause on JavaScript exceptions: https://developer.chrome.com/devtools/docs/javascript-debugging#pause-on-exceptions
.. _Here: https://nodejs.org/api/debugger.html
