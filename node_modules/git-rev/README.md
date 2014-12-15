# git-rev

access git revision state in node

# Example

``` js
var git = require('git-rev')

git.short(function (str) {
  console.log('short', str)
  // => aefdd94
})

git.long(function (str) {
  console.log('long', str)
  // => aefdd946ea65c88f8aa003e46474d57ed5b291d1
})

git.branch(function (str) {
  console.log('branch', str)
  // => master
})

git.tag(function (str) {
  console.log('tag', str)
  // => 0.1.0
})

```

# Methods

``` js 
var git = require('git-rev')
```

## .log(function (array) { ... })
return the git log of `process.cwd()` as an array

``` js
git.log(function (array) {
  console.log('log', array)
  // [ [ 'aefdd946ea65c88f8aa003e46474d57ed5b291d1',
  //     'add description',
  //     '7 hours ago',
  //     'Thomas Blobaum' ],
  //   [ '1eb9a6c8633a5a47a47487f17b17ae545d0e26a8',
  //     'first',
  //     '7 hours ago',
  //     'Thomas Blobaum' ],
  //   [ '7f85b750b908d28bfeb13ad6dba47d9d604508f9',
  //     'first commit',
  //     '2 days ago',
  //     'Thomas Blobaum' ] ]
})
```

## .short(function (commit) { ... })
return the result of `git rev-parse --short HEAD`

## .long(function (commit) { ... })
return the result of `git rev-parse HEAD`

## .tag(function (tag) { ... })
return the current tag

## .branch(function (branch) { ... })
return the current branch

# Install

`npm install git-rev`

# License

(The MIT License)

Copyright (c) 2012 Thomas Blobaum <tblobaum@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
