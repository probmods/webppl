'use strict';

var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var ad = require('../ad');
var config = require('./config');
var serializeParams = require('./serialize').serializeParams;


// The local copy of the parameter table
var _params;


// Called before we start evaluating a webppl program.
function init(k) {
  var store = config.getStore();
  if (!config.isManualId()) {
    config.setFreshId();
  }
  return store.start(function() {
    return sync(k, { incremental: false });
  });
}


function stop(k) {
  var store = config.getStore();
  return store.stop(k);
}


function sync(k, options) {
  var store = config.getStore();
  var next = function(params) {
    if (!params) {
      throw new Error('Expected store to return params, got', params);
    }
    if (options && options.incremental) {
      _.assign(_params, params);
    } else {
      _params = params;
    }
    return k(_params);
  };
  return store.getParams(config.getId(), next);
}


// This is not a continuation-passing style function, since it doesn't
// make use of any store functions that could be asynchronous. Instead,
// it directly returns the current local parameter copy.
function get() {
  return _params;
}


// Save the local parameter table to a file
function save(filename) {
  var s = JSON.stringify(serializeParams(_params));
  fs.writeFileSync(filename, s);
}


function set(params, k) {
  var id = config.getId();
  var store = config.getStore();
  var next = function() {
    _params = params;
    return k();
  };
  return store.setParams(id, params, next);
}


function register(env, name, getParams) {

  // getParams is expected to be a function which is used to
  // initialize parameters the first time they are encountered.

  var paramTable = get();
  var paramsSeen = env.coroutine.paramsSeen;

  if (paramsSeen && _.has(paramsSeen, name)) {

    // We've already lifted these parameters during this execution.
    // Re-use ad graph nodes.

    return paramsSeen[name];

  } else {

    // Get parameter values from the store, or initialize if this is a
    // new parameter.
    var _params;
    if (_.has(paramTable, name)) {
      // Parameters already initialized. Fetch values from store.
      _params = paramTable[name];
    } else {
      // Never seen. Fetch initial values and add to store.
      _params = getParams();
      assert.ok(_.every(_params, _.negate(ad.isLifted)),
                'getParams unexpectedly returned a lifted value.');
      paramTable[name] = _params;
    }

    if (paramsSeen) {
      // Lift parameters if the current coroutine is tracking
      // parameters for optimization.
      var params = _params.map(ad.lift);
      paramsSeen[name] = params;
      return params;
    } else {
      return _params;
    }

  }
}


module.exports = {
  get: get,
  set: set,
  init: init,
  stop: stop,
  register: register,
  save: save,
  sync: sync
};
