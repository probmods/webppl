'use strict';

var assert = require('assert');
var _ = require('underscore');
var SourceMap = require('source-map');
var util = require('../util');

function extendError(error, assets, currentAddress) {
  if (error instanceof Error) {
    error.sourceMap = assets.sourceMap;
    error.wpplCallStack = addressToWpplCallStack(currentAddress.value, assets.addressMap);
    error.wpplRuntimeError = true;
  }
}

function addressToStack(address) {
  if (address === undefined) {
    return [];
  }
  var addUnderscore = function(s) { return '_' + s; };
  var split = address.split('_').slice(1).map(addUnderscore);
  split.reverse();
  return split;
}

function addressToWpplCallStack(address, addressMap) {
  var stack = addressToStack(address);
  return _.chain(stack).map(function(id) {
    var loc = addressMap[id];
    return loc && {
      fileName: loc.source,
      lineNumber: loc.start.line,
      columnNumber: loc.start.column,
      native: false,
      webppl: true,
      name: loc.name,
      id: id
    };
  }).filter().value();
}

function recoverStack(error, parseStack) {
  return util.pipeline([
    parseStack,
    filterJsStackTrace,
    function(s) { return sourceMapJsStackTrace(s, error.sourceMap); },
    function(s) { return s.concat(error.wpplCallStack); }
  ])(error);
}

function filterJsStackTrace(stackTrace) {
  // Takes a parsed stack trace (see v8.js for an example) and removes
  // entries not useful for debugging webppl programs. This means
  // taking the top-most entry corresponding to a function application
  // in webppl code, and any frames above it.

  // When no entry corresponding to application of a webppl function
  // is present, we return the entire stack. The reason this is
  // possible is that (by default in V8) only the top 10 stack frames
  // are captured on error.

  // We can only ever take the top-most webppl frame as any earlier
  // frames may have been generated on a different execution path.
  // (And besides, there should only be one entry as the JS stack is
  // cleared between each webppl function application.)

  var ix = _.findIndex(stackTrace, _.matcher({webppl: true}));
  return (ix >= 0) ? stackTrace.slice(0, ix + 1) : stackTrace;
}

function filterGensym(name) {
  return name === null || name.slice(0, 7) === '_result' ? null : name;
}

function sourceMapJsStackTrace(stackTrace, sourceMap) {
  // Takes a parsed stack trace and rewrites webppl entries to refer
  // to their original location in the source program.

  var map = new SourceMap.SourceMapConsumer(sourceMap);

  return stackTrace.map(function(entry) {
    if (entry.webppl) {
      var pos = map.originalPositionFor({
        line: entry.lineNumber,
        column: entry.columnNumber
      });

      assert.ok(pos.line !== null);
      assert.ok(pos.column !== null);
      assert.ok(pos.source !== null);

      return {
        fileName: pos.source,
        lineNumber: pos.line,
        columnNumber: pos.column,
        native: entry.native,
        webppl: true,
        name: filterGensym(pos.name)
      };
    } else {
      return entry;
    }
  });
}

module.exports = {
  recoverStack: recoverStack,
  extendError: extendError
};
