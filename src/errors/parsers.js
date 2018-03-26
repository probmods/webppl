'use strict';

var assert = require('assert');
var _ = require('lodash');
var stackTrace = require('stack-trace');

function parseV8(error) {
  assert.ok(error instanceof Error);
  var parsed = stackTrace.parse(error);
  return parsed.map(function(entry) {
    var e = _.pick(entry, 'fileName', 'lineNumber', 'columnNumber', 'native');
    // Flag entries that originated in eval'd webppl code. These will
    // be looked up in the source map later.
    e.webppl = entry.fileName === '<anonymous>';
    // v8 column numbers are one indexed. Standardize on zero-based
    // indexed as this is used by the source map library.
    if (entry.columnNumber !== null) {
      e.columnNumber = entry.columnNumber - 1;
    }
    e.name = null;
    return e;
  });
}

module.exports = {
  parseV8: parseV8
};
