webppl
======

Probabilistic programming for the web

[![Build Status](https://travis-ci.org/probmods/webppl.svg?branch=dev)](https://travis-ci.org/probmods/webppl)


## Setup

Requirements:

- [git](http://git-scm.com/)
- [nodejs](http://nodejs.org)

Installation:

    git clone https://github.com/probmods/webppl.git
    cd webppl
    npm install
    npm install -g nodeunit

To use the `webppl` command line tool from any directory, add the webppl directory to your `$PATH`.

Running tests:

    npm test

Executing webppl programs:

    ./webppl examples/geometric.wppl

Compiling webppl for use in browser:

    npm install -g browserify
    browserify -t brfs src/main.js > compiled/webppl.js


## Debugging webppl programs

To debug WebPPL programs running in Chrome, enable [pause on JavaScript exceptions](https://developer.chrome.com/devtools/docs/javascript-debugging#pause-on-exceptions) in the Chrome debugger. To debug WebPPL programs running in nodejs, use node-inspector as follows:

    // 1. Install node-inspector (only need to do this once)
    npm install -g node-inspector
    
    // 2. Compile your webppl program to Javascript
    webppl my-program.wppl --compile --out my-program.js
    
    // 3. Add "debugger;" statements to my-program.js to indicate breakpoints
    
    // 4. Run your compiled program in debug mode (will pause automatically)
    node --debug-brk my-program.js
    
    // 5. (In separate terminal:) Load node inspector, resume program execution in node-inspector
    node-inspector


## Using external functions

### WebPPL code

You can automatically prepend a webppl file `myLibrary.wppl` to your code using the following command:

    webppl myFile.wppl --require-wppl myLibrary.wppl

### Javascript functions and libraries

Using the example of reading and writing CSV files:

1. Install any node modules you want to use:

        npm install -g babyparse

2. Write a Javascript file that exports the functions you want to use:
    
        // simpleCSV.js
        
        var fs = require('fs');
        var babyparse = require('babyparse');
        
        function readCSV(filename){
          return babyparse.parse(fs.readFileSync(filename, 'utf8'));
        };
        
        function writeCSV(jsonCSV, filename){
          fs.writeFileSync(filename, babyparse.unparse(jsonCSV) + "\n");
        }
        
        module.exports = {
          readCSV: readCSV,
          writeCSV: writeCSV
        };

2. Write a WebPPL file that uses your new functions (with module qualifier):

        // csvTest.wppl
        
        var myCSVdata = simpleCSV.readCSV('myinput.csv');
        var myNewData = myCSVdata.data.concat([["foo", 3], ["bar", 10]]);
        simpleCSV.writeCSV(myNewData, 'myoutput.csv');

3. Run your WebPPL file with `require` command line flag:

        webppl csvTest.wppl --require-js ./simpleCSV.js

### Additional header files

Sometimes, it is useful to define external functions that are able to access the store, continuation, and address arguments that are present at any point in a webppl program but usually not exposed to the user. Let's use the example of a function that makes the current address available in WebPPL:

1. Write a Javascript file that exports the functions you want to use:

        // addressHeader.js
        
        function myGetAddress(store, k, address){
          k(store, address);
        };
        
        module.exports = {
          myGetAddress: myGetAddress
        };

2. Write a WebPPL file that uses your new functions (without module qualifier):

        // addressTest.wppl

        var foo = function(){
          var bar = function(){
            console.log(myGetAddress());
          }
          bar()
        }
        
        foo()

3. Run your WebPPL file with `require-header` command line flag:

        webppl addressTest.wppl --require-header ./addressHeader.js
