'use strict';

var assert = require('assert');
var fs = require('fs');
var join = require('path').join;
var _ = require('lodash');
var serialize = require('../serialize');
var util = require('../../util');

var path = _.get(process.env, 'WEBPPL_PARAM_PATH', '.');
var interval = parseInt(_.get(process.env, 'WEBPPL_PARAM_INTERVAL', 1e4));
var verbose = parseInt(_.get(process.env, 'WEBPPL_PARAM_VERBOSE', 0));

// Holds a {params, timestamp} object per parameter set id.
var store = {};

function filename(id) {
  assert.ok(_.isString(path), 'Expected path to be defined.');
  return join(path, id + '.json');
}

function read(id) {
  try {
    var params = serialize.deserializeParams(fs.readFileSync(filename(id)));
    if (verbose) {
      console.log('Read parameter set ' + id + '.');
    }
    return params;
  } catch (e) {
    if (verbose) {
      console.log('No file found for parameter set ' + id +
                  '. Using empty parameter set.');
    }
    return {};
  }
}

function write(params, id) {
  try {
    fs.writeFileSync(filename(id), serialize.serializeParams(params));
    if (verbose) {
      console.log('Wrote parameter set ' + id + '.');
    }
  } catch (e) {
    util.warn('Error writing parameter set ' + id + '.');
  }
}

// External interface:

function start(k) {
  // Ensure the parameter directory (currently) exists, error
  // otherwise.
  fs.accessSync(path);
  return k();
}

// Write all parameters to disk after the program completes.
function stop(k) {
  _.forEach(store, function(obj, id) {
    write(obj.params, id);
  });
  return k();
}

// Parameters are read from the file the first time they are requested
// by a call to `getParams`. Thereafter, we don't re-read from the
// file as we do not support parallel use of this store.
function getParams(id, k) {
  if (!_.has(store, id)) {
    store[id] = {params: read(id), timestamp: Date.now()};
  }
  return k(store[id].params);
}

// Perform throttled writes to disk when Optimize updates parameters.
// This makes it possible to recover progress should the program crash
// before the final write happens. The frequency of writes can be
// controlled using an environment variable.
function setParams(id, params, k) {
  store[id].params = params;
  var now = Date.now();
  if (now - store[id].timestamp > interval) {
    write(params, id);
    store[id].timestamp = now;
  }
  return k();
}

module.exports = {
  start: start,
  stop: stop,
  getParams: getParams,
  setParams: setParams
};
