'use strict';

var path = require('path');
var _ = require('underscore');

var isRequireable = function(path) {
  try {
    require.resolve(path);
    return true;
  } catch (e) {
    return false;
  }
};

var read = function(name_or_path) {

  // Locate packages and make filenames absolute.

  var name = path.basename(name_or_path);
  var absPath = path.resolve(name_or_path);
  var manifest = require(path.join(absPath, 'package.json')).webppl || {};

  var makeAbs = function(fn) { return path.join(absPath, fn); };

  return {
    js: isRequireable(absPath) && { identifier: name.replace('-', '_'), path: absPath },
    headers: _.map(manifest.headers, makeAbs),
    wppl: _.map(manifest.wppl, makeAbs)
  };
};

var wrapWithQuotes = function(s) { return '"' + s + '"'; };
var wrapWithRequire = function(s) { return 'require("' + s + '")'; };
var wrapWithReadFile = function(s) { return 'fs.readFileSync("' + s + '", "utf8")'; };

var wrappers = {
  identifier: wrapWithQuotes,
  headers: wrapWithRequire,
  path: wrapWithRequire,
  wppl: wrapWithReadFile
};

// Recursively transform a package (as returned by read) into an expression
// which can be transformed by the browserify plugin.

var stringify = function(obj, lastSeenKey) {
  if (_.isArray(obj)) {
    return '[' + obj.map(function(x) { return stringify(x, lastSeenKey); }).join(', ') + ']';
  } else if (_.isObject(obj)) {
    var s = _.map(obj, function(value, key) {
      return key + ': ' + stringify(value, key) + '';
    }).join(', ');
    return '{ ' + s + ' }';
  } else if (_.isString(obj)) {
    return wrappers[lastSeenKey](obj);
  }
}

module.exports = {
  read: read,
  stringify: stringify
};
