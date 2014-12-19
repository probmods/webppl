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

Generates [SpiderMonkey AST](https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API) from given template string, optional [esprima](http://esprima.org/doc/index.html) options and data.

Supported template substitution markers:

  * Compile-time execution block: `<% var localCounter = 0; %>`
  * Node substitution: `var x = <%= expr %> + 1;`
  * Array elements: `var a = [%= elements %];`
  * Function parameters: `function f(%= params %) {}`
  * Call arguments: `var x = f(%= args %);`
  * Block statements: `define(function () {%= body %});`
  * Literals: `var x = "%= 'alpha' + 'beta' %";`

You can combine list substitutions with inline elements like:
  * `var a = [0, %= numbers %, Infinity];`
  * `function f(%= params %, callback) {}`
  * `define(function () { console.time('Module'); %= body %; console.timeEnd('Module'); });`

From template, you can access entire data object via `it` and estemplate itself via `estemplate`.

If you set `options.fast` to true, then passed data will be available only via `it` variable, but template function in general will be significantly faster.

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

### Advanced generation (with source map)

> template.jst

```javascript
define(function (require, exports, module) {% = body %});
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
var templateCode = fs.readFileSync('template.jst', 'utf-8');
var template = estemplate.compile(templateCode, {attachComment: true});

var program = esprima.parse(fs.readFileSync('index.js', 'utf-8'), {
    loc: true,
    source: 'index.js'
});

var ast = template({body: program.body});

var output = escodegen.generate(ast, {
  sourceMap: true,
  sourceMapWithCode: true
});

console.log(output.code);
```

> output

```javascript
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
