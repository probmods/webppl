# estemplate [![Build Status](https://secure.travis-ci.org/RReverser/estemplate.png?branch=master)](http://travis-ci.org/RReverser/estemplate)

> Proper JavaScript code templating with source maps support.

This module allows to generate JavaScript AST from code template and AST nodes as substitutions.

This is more proper way of code templating since it works on AST not on code string, and thus preserves locations which allow to generate source maps in future.

## Getting Started
Install the module with: `npm install estemplate` and require it:

```shell
npm i estemplate --save
```

```javascript
var estemplate = require('estemplate');
```

## API

### estemplate(tmplString, [options], data)

Generates Spidermonkey AST from given template string, optional [esprima](http://esprima.org/doc/index.html) options and data.

Template string should be JavaScript code with `<% ...execute me... %>` markers for compile-time calculations and `<%= ...insert me... %>` markers for node substitutions (adapted ERB/Underscore/etc. style).

### estemplate.compile(tmplString, [options])

Same as above but returns function that can be reused for AST generation (just save result and call with `data` as argument whenever needed).

## Examples

### Simple generation

```javascript
var ast = estemplate('var <%= varName %> = <%= value %> + 1;', {
  varName: {type: 'Identifier', name: 'myVar'},
  value: {type: 'Literal', value: 123}
});

console.log(escodegen.generate(ast));
// > var myVar = 123 + 1;
```

### Advanced generation (preserving locations and file names)

> template.jst

```javascript
/** Simplified CommonJS wrapper */

define(function (require, exports, module) {
<%= block %>
});
```

> index.js

```javascript
var dependency1 = require('dependency1'),
    dependency2 = require('dependency2');

module.exports = function () {
	return dependency1() + dependency2();
};
```

> main code

```javascript
// synchronously reading wrapper template and code (for example purposes only)

var template = fs.readFileSync('template.jst', 'utf-8');
var programBlock = esprima.parse(fs.readFileSync('index.js', 'utf-8'), {loc: true, source: 'index.js'});

// changing Program to BlockStatement so it could be injected
programBlock.type = 'BlockStatement';

// generate resulting AST with preserved locations and file names
var ast = estemplate(template, {loc: true, source: 'template.jst', attachComment: true}, {
	block: programBlock
});

// generate code and source map as {code, map}
var output = escodegen.generate(ast, {comment: true, sourceMap: true, sourceMapWithCode: true});

console.log(output.code);                                                           
```

> output

```javascript
/** Simplified CommonJS wrapper */                                                  
define(function (require, exports, module) {                                        
    var dependency1 = require('dependency1'), dependency2 = require('dependency2'); 
    module.exports = function () {                                                  
        return dependency1() + dependency2();                                       
    };                                                                              
});                      
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## License
Copyright (c) 2014 Ingvar Stepanyan. Licensed under the MIT license.
