'use strict';

var path = require('path');
var _ = require('underscore');
var git = require('./git');

var webpplRootDir = path.join(__filename, '..', '..');

// Retrieve version information for an npm package from package.json
// and git. If `dir` is not given, version information for webppl is
// returned.

function version(dir) {
  dir = dir || webpplRootDir;
  var ver = require(path.join(dir, 'package.json')).version;
  var hash = git.short(dir);
  return _.filter(['v' + ver, hash]).join('-');
}

module.exports = {
  version: version
};
