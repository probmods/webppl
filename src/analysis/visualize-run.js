'use strict';

var prepare = require('./main').prepare;
var analyze = require('./main').analyze;
var vizualize = require('./visualize').vizualize;

process.stdin.setEncoding('utf8');

var program = '';

process.stdin.on('data', function(data) {
  program += data;
});

process.stdin.on('end', function() {
  vizualize(analyze(prepare(program)), process.stdout);
});
