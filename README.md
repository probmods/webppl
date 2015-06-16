webppl [![Build Status](https://travis-ci.org/probmods/webppl.svg?branch=dev)](https://travis-ci.org/probmods/webppl) [![Dependency Status](https://david-dm.org/probmods/webppl.svg)](https://david-dm.org/probmods/webppl)
======

Probabilistic programming for the web

## Quick start

Install using [nodejs](http://nodejs.org):

    npm install -g webppl

Run webppl programs:

    webppl myprogram.wppl

Upgrade webppl:

    npm update -g webppl

## License

webppl is released under the [MIT License](LICENSE.md).

## Contributions

We encourage you to contribute to webppl! Check out our [guidelines for contributors](CONTRIBUTING.md) and join the [webppl-dev](https://groups.google.com/forum/#!forum/webppl-dev) mailing list.

## Installation from GitHub

    git clone https://github.com/probmods/webppl.git
    cd webppl
    npm install
    npm install -g nodeunit grunt-cli

To use the `webppl` command line tool from any directory, add the webppl directory to your `$PATH`.

## Usage

Running webppl programs:

    webppl examples/geometric.wppl

Compiling webppl programs to Javascript:

    webppl examples/geometric.wppl --compile --out geometric.js

The compiled file can be run using nodejs:

    node geometric.js

## Development

Before committing changes, run grunt (which runs tests and linting):

    grunt

If grunt doesn't succeed, the [continuous integration tests](https://travis-ci.org/probmods/webppl) will fail as well.

To only run the tests, do:

    npm test

To only run the linter:

    grunt gjslint

For more semantic linting, try:

    grunt hint

If gjslint complains about style errors (like indentation), you can fix many of them automatically using:

    grunt fixjsstyle

To compile webppl for use in browser, run:

    npm install -g browserify
    browserify -t brfs src/main.js > compiled/webppl.js

## Debugging

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
          return k(store, address);
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

## Updating the npm package

1. Update version in dev:

        git checkout dev
        npm version patch  // or minor, or major; prints new version number

2. Merge into master

        git checkout master
        git merge dev
        grunt
    
3. Push to remotes and npm

        git push origin dev
        git push origin master
        git push origin v0.0.1  // again, use version printed by "npm version" command above
        npm publish
