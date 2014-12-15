webppl
======

Probabilistic programming for the web

[![Build Status](https://travis-ci.org/probmods/webppl.svg?branch=trampoline)](https://travis-ci.org/probmods/webppl)

Requirements:

- [git](http://git-scm.com/)
- [nodejs](http://nodejs.org)

Installation:

    git clone https://github.com/probmods/webppl.git
    cd webppl
    npm install

Run tests:

    npm test

Execute webppl program:

    ./webppl examples/geometric.wppl

Compile webppl for use in browser:

    npm install -g browserify
    browserify -t brfs src/main.js > compiled/webppl.js

How to debug webppl programs:

    // 1. Install node-inspector (only need to do this once)
    npm install -g node-inspector
    
    // 2. Compile your webppl program to Javascript
    webppl my-program.wppl --compile --out my-program.js
    
    // 3. Add "debugger;" statements to my-program.js to indicate breakpoints
    
    // 4. Run your compiled program in debug mode (will pause automatically)
    node --debug-brk my-program.js
    
    // 5. (In separate terminal:) Load node inspector, resume program execution in node-inspector
    node-inspector
