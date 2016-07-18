'use strict';

var _ = require('underscore');
var errors = require('./errors');
var parseV8 = require('./parsers').parseV8;

function isChrome() {
  return window.chrome && window.chrome.runtime;
}

function extendErrorChrome(error, fileName) {
  var stack = errors.recoverStack(error, parseV8);
  var entry = _.findWhere(stack, {fileName: fileName});
  error.wpplError = entry;
}

function debugHandler(fileName) {
  return function(error) {
    if (error instanceof Error && isChrome()) {
      extendErrorChrome(error, fileName);
    }
    throw error;
  };
}

module.exports = {
  debugHandler: debugHandler
};
