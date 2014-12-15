var git = require('../')

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
