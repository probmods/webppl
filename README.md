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
    browserify -t brfs src/browser.js > compiled/webppl.js

Packages can also be used in the browser. For example, to include the `webppl-viz` package use:

    browserify -t [./src/bundle.js --require webppl-viz] -t brfs src/browser.js > compiled/webppl.js

Multiple `--require` arguments can be used to include multiple packages.

## Debugging

To debug WebPPL programs running in Chrome, enable [pause on JavaScript exceptions](https://developer.chrome.com/devtools/docs/javascript-debugging#pause-on-exceptions) in the Chrome debugger. To debug WebPPL programs running in nodejs, use node-inspector as follows:

    // 1. Install node-inspector (only need to do this once)
    npm install -g node-inspector

    // 2. Add "debugger;" statements to my-program.js to indicate breakpoints

    // 3. Run your compiled program in debug mode (will pause automatically)
    node --debug-brk webppl my-program.js

    // 4. (In separate terminal:) Load node inspector, resume program execution in node-inspector
    node-inspector


## Packages

WebPPL packages are regular Node.js packages optionally extended to include WebPPL code and headers.

To make a package available in your program use the `--require` argument:

    webppl myFile.wppl --require myPackage

WebPPL will search the following locations for packages:

1. The `node_modules` directory within the directory in which your program is stored.
2. The `.webppl/node_modules` directory within your home directory. Packages can be installed into this directory with `npm install --prefix ~/.webppl myPackage`.

Packages can be loaded from other locations by passing a path:

    webppl myFile.wppl --require ../myPackage

### Package Structure

Packages can extend WebPPL in three ways:

#### WebPPL code

You can automatically prepend WebPPL files to your code by added a `wppl` entry to `package.json`. For example:

    {
      "name": "my-package"
      "webppl": {
        "wppl": ["myLibrary.wppl"]
      }
    }

#### Javascript functions and libraries

Any regular Javascript code within a package is made available in WebPPL as a global variable. The global variable takes the same name as the package except when the package name includes one or more `-` characters. In such cases the name of the global variable is obtained by converting the package name to camelCase.

For example, if the package `my-package` contains this file:

    // index.js
    module.exports = {
      myAdd: function(x, y) { return x + y; }
    };

Then the function `myAdd` will be available in WebPPL as `myPackage.myAdd`.

If your Javascript isn't in an `index.js` file in the root of the package, you should indicate the entry point to your package by adding a `main` entry to `package.json`.

Note that packages must export functions as properties of an object. Exporting functions directly will not work as expected.

### Additional header files

Sometimes, it is useful to define external functions that are able to access WebPPL internals. Header files have access to the following:

* The store, continuation, and address arguments that are present at any point in a WebPPL program.
* The `env` container which allows access to `env.coroutine` among other things.

Let's use the example of a function that makes the current address available in WebPPL:

1. Write a Javascript file that exports a function. The function will be called with the `env` container and should return an object containing the functions you want to use:

        // addressHeader.js

        module.exports = function(env) {

          function myGetAddress(store, k, address) {
            return k(store, address);
          };

          return { myGetAddress: myGetAddress };

        };

2. Add a `headers` entry to `package.json`:

        {
          "name": "my-package"
          "webppl": {
            "headers": ["addressHeader.js"]
          }
        }

3. Write a WebPPL file that uses your new functions (without module qualifier):

        // addressTest.wppl

        var foo = function() {
          var bar = function() {
            console.log(myGetAddress());
          }
          bar();
        };

        foo();

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
