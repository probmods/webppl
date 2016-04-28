'use strict';

var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var pkginfo = require('./pkginfo');

var isJsModule = function(path) {
  try {
    require.resolve(path);
    return true;
  } catch (e) {
    return false;
  }
};

var globalPkgDir = function() {
  // USERPROFILE is intended to support Windows. This is un-tested.
  var home = process.env.HOME || process.env.USERPROFILE;
  return home ? path.join(home, '.webppl', 'node_modules') : '';
};

var isPath = function(s) {
  // This isn't expected to classify any valid NPM package names as paths.
  // https://github.com/npm/validate-npm-package-name
  return s.indexOf(path.sep) >= 0 || s.substr(0, 1) === '.';
};

var toCamelCase = function(name) {
  return _.chain(name.split('-')).compact().map(function(s, i) {
    return i > 0 ? upcaseInitial(s) : s;
  }).value().join('');
};

var upcaseInitial = function(s) {
  if (s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1);
};

var read = function(name_or_path, paths, verbose) {
  var paths = paths || [globalPkgDir()];
  var log = verbose ? function(x) { console.warn(x); return x; } : _.identity;

  var readFirst = function(candidates) {
    if (candidates.length > 0) {
      var candidate = path.resolve(candidates[0]);
      var candidatePackagePath = path.join(candidate, 'package.json');
      if (fs.existsSync(candidatePackagePath)) {
        var manifest = require(candidatePackagePath);
        manifest.webppl = manifest.webppl || {};
        var name = manifest.name;
        log('Loading module "' + name + '" from "' + candidate + '"');
        var joinPath = function(fn) { return path.join(candidate, fn); };
        return {
          name: name,
          js: isJsModule(candidate) && { identifier: toCamelCase(name), path: candidate },
          headers: _.map(manifest.webppl.headers, joinPath),
          wppl: _.map(manifest.webppl.wppl, function(manifestPath) {
            return {
              rel: path.join(path.basename(candidate), manifestPath),
              full: joinPath(manifestPath)
            };
          }),
          macros: _.map(manifest.webppl.macros, joinPath),
          version: pkginfo.version(candidate)
        };
      } else {
        return readFirst(candidates.slice(1));
      }
    } else {
      log(allCandidates);
      throw 'Could not find WebPPL package: ' + name_or_path;
    }
  };

  var joinName = function(p) { return path.join(p, name_or_path); };
  var allCandidates = isPath(name_or_path) ? [name_or_path] : paths.map(joinName);

  return log(readFirst(allCandidates))
};

var load = function(pkg) {
  return {
    js: pkg.js,
    headers: pkg.headers,
    wppl: pkg.wppl.map(function(path) {
      return {
        code: fs.readFileSync(path.full),
        filename: path.full
      };
    }),
    macros: pkg.macros.map(function(fn) { return fs.readFileSync(fn); })
  };
};

// Recursively transform a package (as returned by read) into an
// expression which can be transformed by the browserify plugin.

var stringify = function(obj) {
  var kvs = _.chain(obj).mapObject(function(val, key) {
    if (_.isArray(val)) {
      return stringifyArray(val, wrappers[key]);
    } else if (_.isBoolean(val)) {
      return val.toString();
    } else if (_.isObject(val)) {
      return stringify(val);
    } else {
      return wrappers[key](val);
    }
  }).map(function(val, key) {
    return key + ': ' + val;
  }).value();
  return '{' + kvs.join(', ') + '}';
};

var stringifyArray = function(arr, f) {
  return '[' + arr.map(f).join(', ') + ']';
};

var wrapWithRequire = function(path) { return 'require("' + path + '")'; };
var wrapWithQuotes = function(s) { return '"' + s + '"'; };

var wrappers = {
  wppl: function(path) {
    return '{ code: fs.readFileSync("' + path.full + '", "utf8"), filename: "' + path.rel + '" }';
  },
  macros: function(path) { return 'fs.readFileSync("' + path + '", "utf8")'; },
  headers: wrapWithRequire,
  identifier: wrapWithQuotes,
  path: wrapWithRequire,
  name: wrapWithQuotes,
  version: wrapWithQuotes
};

module.exports = {
  read: read,
  load: load,
  stringify: stringify,
  globalPkgDir: globalPkgDir
};
