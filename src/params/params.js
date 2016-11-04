'use strict';

var _ = require('underscore');
var ad = require('../ad');
var config = require('./config');

// The local copy of the parameter set

var _params;


// Called before evaluating a webppl program. We only reset the
// parameter set ID if no manual ID has been provided.
function init(k) {
  var store = config.getStore();
  if (!config.isManualId()) {
    config.setFreshId();
  }
  return store.init(function() { return sync(k); });
}

function sanityCheck() {
  // If errors are throw from here, it may be that two or more calls
  // to require are returning distinct instances of this module,
  // preventing the correct sharing of _id and _params.
  const id = config.getId();
  if (id === undefined) {
    throw new Error('Expected the parameter set id to be defined.');
  }
}

function sync(k) {
  sanityCheck();
  var store = config.getStore();
  var next = function(params) {
    if (!params) {
      throw new Error('Expected store to return params, got', params);
    }
    _params = params;
    return k(params);
  };
  return store.getParams(next, config.getId());
}

// This is not a continuation-passing style function, since it doesn't
// make use of any store functions (that could be asynchronous) but
// rather returns the current local parameter copy directly.
function get() {
  sanityCheck();
  return _params;
}

// When a coroutine wishes to update parameters it does so by calling
// this method. This updates both the local parameters and those in
// the store.
function inc(k, deltas) {
  sanityCheck();
  var store = config.getStore();
  var next = function(params) {
    if (!params) {
      throw new Error('Expected store to return params, got', params);
    }
    _params = params;
    return k(params);
  };
  return store.incParams(next, config.getId(), _params, deltas);
}

var registerParams = function(env, name, getParams, setParams) {

  // getParams is expected to be a function which is used to
  // initialize parameters the first time they are encoutered. At
  // present I consider it to be `registerParams` responsibility to
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
      var _params = getParams().map(ad.value);
      paramTable[name] = _params;
      params = _params.map(ad.lift);
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

};

module.exports = {
  get: get,
  inc: inc,
  init: init,
  registerParams: registerParams,
  sync: sync
};
