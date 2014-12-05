webppl
======

Probabilistic programming for the web

[![Build Status](https://travis-ci.org/probmods/webppl.svg?branch=storepassing)](https://travis-ci.org/probmods/webppl)

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
