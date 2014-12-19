webppl
======

Probabilistic programming for the web

[![Build Status](https://travis-ci.org/probmods/webppl.svg?branch=master)](https://travis-ci.org/probmods/webppl)

Requirements:

- [git](http://git-scm.com/)
- [nodejs](http://nodejs.org)

**Installation**

    git clone https://github.com/probmods/webppl.git
    cd webppl
    npm install

To use the `webppl` command line tool from any directory, add the webppl directory to your `$PATH`.

**Running test**

    npm test

**Executing webppl programs**

    ./webppl examples/geometric.wppl

**Compiling webppl for use in browser**

    npm install -g browserify
    browserify -t brfs src/main.js > compiled/webppl.js

**Debugging webppl programs**

    // 1. Install node-inspector (only need to do this once)
    npm install -g node-inspector
    
    // 2. Compile your webppl program to Javascript
    webppl my-program.wppl --compile --out my-program.js
    
    // 3. Add "debugger;" statements to my-program.js to indicate breakpoints
    
    // 4. Run your compiled program in debug mode (will pause automatically)
    node --debug-brk my-program.js
    
    // 5. (In separate terminal:) Load node inspector, resume program execution in node-inspector
    node-inspector

**Using Javascript functions and external libraries**

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

2. Write a WebPPL file that uses your new functions:

        // csvTest.wppl
        
        var myCSVdata = simpleCSV.readCSV('myinput.csv');
        var myNewData = myCSVdata.data.concat([["foo", 3], ["bar", 10]]);
        simpleCSV.writeCSV(myNewData, 'myoutput.csv');

3. Run your WebPPL file with `require` command line flag:

        webppl csvTest.wppl --require ./simpleCSV
