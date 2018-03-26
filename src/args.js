'use strict';

var parseArgs = require('minimist');

function makeGlobal(programFile, argv) {
  global.argv = parseArgs([programFile].concat(argv));
}

module.exports = {
  makeGlobal: makeGlobal
};
