var stackTrace = require('stack-trace');
var SourceMap = require('source-map');
var colors = require('colors/safe');
var fs = require('fs');

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

  var previousTotal = previousLine == 'undefined\n' ? '' : previousPrefix + previousLine;
  var errorTotal = errorPrefix + errorLine;
  var followingTotal = followingLine == 'undefined\n' ? '' : followingPrefix + followingLine;

  return previousTotal + errorTotal + (padding + getArrow(columnNumber)) + followingTotal;
}

function printFriendlyStackTrace(error, sourceMap) {
  var mapConsumer = new SourceMap.SourceMapConsumer(sourceMap);
  var parsedError = stackTrace.parse(error);
  var firstStackFrame = parsedError[0];

  var originalPosition = mapConsumer.originalPositionFor({
    line: firstStackFrame.lineNumber,
    column: firstStackFrame.columnNumber - 1
  })

  if (originalPosition.source !== null) {
    console.log('\n' + colors.bold(error.toString()));
    console.log('    at ' + originalPosition.source + ':' + originalPosition.line + '\n');
    console.log(getContextMessage(mapConsumer.sourceContentFor(originalPosition.source),
                                  originalPosition.line,
                                  originalPosition.column));
  } else {
    console.log(firstStackFrame.fileName + ':' + firstStackFrame.lineNumber + '\n');
    // missing the actual line of that file
    console.log(error.stack);
  }
}

module.exports = printFriendlyStackTrace;
