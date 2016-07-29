'use strict';

// This file contains node specific error handling logic. It's node
// specific because we assume console.log is hooked up to something
// that supports ANSI color codes and we make use of access to the
// file system.

// Separating this out helps because we can avoid including it in the
// browser bundle unnecessarily.

var _ = require('underscore');
var assert = require('assert');
var colors = require('colors/safe');
var fs = require('fs');
var SourceMap = require('source-map');

function repeatString(string, count) {
  return Array(count).join(string);
}

function pad(pad, str, padLeft) {
  if (typeof str === 'undefined')
    return pad;
  if (padLeft) {
    return (pad + str).slice(-pad.length);
  } else {
    return (str + pad).substring(0, pad.length);
  }
}

function getArrow(length) {
  return '  ' + repeatString('-', length + 1) + '^\n';
}

function getContextMessage(source, lineNumber, columnNumber) {
  source = source.split('\n');
  var lineDigits = ('' + (lineNumber + 1)).length + 1;
  var padding = repeatString(' ', lineDigits);

  var previousPrefix = colors.dim(pad(padding, (lineNumber - 1), true) + '| ');
  var errorPrefix = colors.dim(pad(padding, lineNumber, true) + '| ');
  var followingPrefix = colors.dim(pad(padding, (lineNumber + 1), true) + '| ');

  var previousLine = source[lineNumber - 2] + '\n';
  var errorLine = colors.bold(source[lineNumber - 1]) + '\n';
  var followingLine = source[lineNumber] + '\n';

  previousLine = previousLine.trim().slice(0, 2) === '//' ? colors.dim(previousLine) : previousLine;
  followingLine = followingLine.trim().slice(0, 2) === '//' ? colors.dim(followingLine) : followingLine;

  var previousTotal = previousLine === 'undefined\n' ? '' : previousPrefix + previousLine;
  var errorTotal = errorPrefix + errorLine;
  var followingTotal = followingLine === 'undefined\n' ? '' : followingPrefix + followingLine;

  return previousTotal + errorTotal + (padding + getArrow(columnNumber)) + followingTotal;
}

function showMessage(message) {
  console.log('\n' + colors.bold(message));
}

function showLocationInCode(code, entry) {
  console.log('    at ' + entry.fileName + ':' + entry.lineNumber + '\n');
  console.log(getContextMessage(code, entry.lineNumber, entry.columnNumber));
}

function codeForEntry(entry, sourceMap) {
  var fileName = entry.fileName;
  return entry.webppl ?
      codeFromSourceMap(fileName, sourceMap) :
      fs.readFileSync(fileName, 'utf8');
}

function codeFromSourceMap(fileName, sourceMap) {
  var map = new SourceMap.SourceMapConsumer(sourceMap);
  return map.sourceContentFor(fileName);
}

function showRecoveredStack() {
  // If this is something we want, then I think that we need to
  // include in the address map the enclosing function for each call
  // site. This would give us the information we need to show
  // something similar to the JS trace back.
}

function findEntryByFileName(stack, fileName) {
  return _.findWhere(stack, {fileName: fileName});
}

function findNonNativeEntry(stack) {
  var entry = _.findWhere(stack, {native: false});
  assert.ok(entry !== undefined);
  return entry;
}

// Main entry point.
function showError(error, recoveredStack, programFile) {
  var sourceMap = error.sourceMap;
  // Find the first non-native entry so we can always show some code.
  var entry = findNonNativeEntry(recoveredStack);
  var code = codeForEntry(entry, sourceMap);

  // Find the top-most entry originating from user code. When not in
  // debug mode such an entry may not exist.
  var userEntry = findEntryByFileName(recoveredStack, programFile);

  showMessage(error.toString());
  showLocationInCode(code, entry);

  if (userEntry && !_.isEqual(entry, userEntry)) {
    var userCode = codeForEntry(userEntry, sourceMap);
    showLocationInCode(userCode, userEntry);
  }
}

module.exports = {
  showError: showError
};
