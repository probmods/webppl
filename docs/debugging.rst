Debugging
=========

To debug WebPPL programs running in Chrome, enable `pause on JavaScript
exceptions`_ in the Chrome debugger. To debug WebPPL programs running in
nodejs, use node-inspector as follows::

    // 1. Install node-inspector (only need to do this once)
    npm install -g node-inspector

    // 2. Add "debugger;" statements to my-program.wppl to indicate breakpoints

    // 3. Run your compiled program in debug mode (will pause automatically)
    node --debug-brk webppl my-program.wppl

    // 4. (In separate terminal:) Load node inspector, resume program execution in node-inspector
    node-inspector

.. _pause on JavaScript exceptions: https://developer.chrome.com/devtools/docs/javascript-debugging#pause-on-exceptions
