webppl
======

Probabilistic programming for the web

Installation:

    git clone https://github.com/probmods/webppl.git
    cd webppl
    npm install

Run tests:

    ./run-tests

Execute webppl program:

    ./webppl examples/geometric.wppl

Compile webppl for use in browser:

    npm install -g browserify
    browserify -t brfs src/main.js > compiled/webppl.js
