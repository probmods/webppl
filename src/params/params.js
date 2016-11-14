'use strict';

var _ = require('underscore');
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
  return store.start(function() { return sync(k); });
}


function stop(k) {
  var store = config.getStore();
  return store.stop(k);
}


function sync(k) {
  var store = config.getStore();
  var next = function(params) {
    if (!params) {
      throw new Error('Expected store to return params, got', params);
    }
    _params = params;
    return k(params);
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
  fs.writeFileSync(options.checkpointParamsFilename, s);
}


// When a coroutine wishes to update parameters, it does so by calling
// this method. This updates both the local parameters and those in
// the store.
function inc(deltas, k) {
  var id = config.getId();
  var store = config.getStore();
  var next = function(params) {
    if (!params) {
      throw new Error('Expected store to return params, got', params);
    }
    _params = params;
    return k(params);
  };
  return store.incParams(id, _params, deltas, next);
}


function register(env, name, getParams, setParams) {

  // getParams is expected to be a function which is used to
  // initialize parameters the first time they are encoutered. At
  // present I consider it to be `register` responsibility to
  // perform lifting of params, so ideally `getParams` would not
  // return lifted params. However, in the case of NN, `getParams`
  // returns params already lifted. Hence, `getParams()` is replaced
  // with `getParams().map(ad.value)` throughout this function.

  var paramTable = get();
  var paramsSeen = env.coroutine.paramsSeen;

  if (paramsSeen && _.has(paramsSeen, name)) {

    // We've already lifted these params during this execution.
    // Re-use ad graph nodes.

    return paramsSeen[name];

  } else {

    // This is the first time we've encounter these params during
    // this execution. we will lift params at this point.

    var params;

    if (_.has(paramTable, name)) {
      // Seen on previous execution. Fetch from store and lift.
      params = paramTable[name].map(ad.lift);
    } else {
      // Never seen. Fetch initial values, add to store and lift.
      var prms = getParams().map(ad.value);
      paramTable[name] = prms;
      params = prms.map(ad.lift);
    }

    if (paramsSeen) {
      paramsSeen[name] = params;
    }

    // Callback with the fresh ad graph nodes.
    if (setParams) {
      setParams(params);
    }

    return params;
  }

}


module.exports = {
  get: get,
  inc: inc,
  init: init,
  stop: stop,
  register: register,
  save: save,
  sync: sync
};
