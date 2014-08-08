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

Updated compiled version of webppl for browser:

    npm install -g browserify
    browserify -u node_modules/amdefine/amdefine.js src/main.js > compiled/webppl.js
