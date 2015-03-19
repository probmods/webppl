"use strict";

var _ = require('underscore');

var evalRegex = /at .*\.eval/;

var getEvalDetails = function (line) {
  var evalDetails = {
    isEval: line.indexOf('eval at') !== -1 || evalRegex.test(line)
  };

  if (evalDetails.isEval) {
    var evalDetailsArray = line.substring(line.lastIndexOf(', ') + 2, line.lastIndexOf(')')).split(':');
    _.extend(evalDetails, {
      evalFileName: evalDetailsArray[0],
      evalLineNumber: parseInt(evalDetailsArray[1], 10),
      evalColumnNumber: parseInt(evalDetailsArray[2], 10)
    });
  }

  return evalDetails;
};

var getFileDetails = function (line) {
  var fileDetailsArray = line.substring(line.lastIndexOf('(') + 1, line.length - 1).split(':');
  return {
    fileName: fileDetailsArray[0],
    lineNumber: parseInt(fileDetailsArray[1], 10),
    columnNumber: parseInt(fileDetailsArray[2], 10)
  };
};

var getFunctionName = function (line) {
  var afterAtIndex = line.indexOf('at ') + 'at '.length,
    spaceAfterFunctionIndex = line.indexOf(' ', afterAtIndex);

  return {
    functionName: line.substring(afterAtIndex, spaceAfterFunctionIndex)
  };
};

var getTypeAndMessage = function (line) {
  var typeAndMessageArray = line.split(': ');

  return {
    type: typeAndMessageArray[0],
    message: typeAndMessageArray[1]
  };
};

var getLastEvalTrace = function (stackTrace) {
  var stacks = stackTrace.stacks;
  for (var i = 0; i < stacks.length; i++) {
    if (stacks[i].isEval) {
      return stacks[i];
    }
  }
  return null;
};

var processSourceMap = function (stackTrace, sourceMapConsumer) {
  var result = [];
  var stacks = stackTrace.stacks;
  var evaledStacks = stacks.filter(function (stack) {
    return stack.isEval
  });
  var errorInfo = null;
  for (var i = 0; i < evaledStacks.length; i++) {
    var stack = evaledStacks[i];
    var origPos = sourceMapConsumer.originalPositionFor(
      {line: stack.evalLineNumber, column: stack.evalColumnNumber - 1});
    if (origPos.line) {
      result.push(
        formatOriginalPosition(
          origPos.source,
          origPos.line,
          origPos.column + 1,
          origPos.name));
      if (!errorInfo) {
        errorInfo = origPos;
      }
    } else {
      result.push(
        formatOriginalPosition(
          stack.fileName,
          stack.lineNumber,
          stack.columnNumber,
          stack.functionName));
    }
  }
  return {stacks: result, errorInfo: errorInfo};
};

var formatOriginalPosition = function (source, line, column, name) {
  // Mimics Chrome's format
  return "    at " + (name ? name : "(unknown)") +
    " (" + source + ":" + line + ":" + column + ")";
};

module.exports = {
  parse: function (error) {
    var lines = error.stack.split('\n');

    var typeAndMessage = getTypeAndMessage(lines[0]);
    var parsedLines = lines.slice(1).map(this.parseLine);

    return _.extend(typeAndMessage, {stacks: parsedLines});
  },

  parseLine: function (line) {
    return _.extend(
      getFileDetails(line),
      getEvalDetails(line),
      getFunctionName(line)
    );
  },

  getSourceMappedStackTrace: function (stackTrace, sourceMapConsumer, code) {
    var evalStack = processSourceMap(stackTrace, sourceMapConsumer);
    var errorInfo = evalStack.errorInfo;
    var errorLineNumber = errorInfo ? errorInfo.line.toString() : "";
    var errorLine = errorInfo ? code.toString().split('\n')[errorInfo.line - 1] : "";
    var errorSource = errorInfo ? errorInfo.source : "";
    return errorSource + ":" + errorLineNumber + "\n" + errorLine + "\n\n" +
      stackTrace.type + ": " + stackTrace.message + "\n" + evalStack.stacks.join("\n");
  }
};
