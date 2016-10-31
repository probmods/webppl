'use strict';

var _ = require('underscore');
var ad = require('../ad');
var store = require('./store');

// These hold the id of the current parameter set, the local copy of
// that parameter set.

var _id, _params;

// Called before evaluating a webppl program.
function init() {
  setFreshId();
  sync();
}

// We imagine that in the future we'll also be able to set _id from
// the command-line.
function setFreshId() {
  _id = 'run-' + Math.random().toString(36).substring(2, 10);
}

function sync() {
  _params = store.getParams(_id);
}

function get() {
  return _params;
}

// When a coroutine wishes to update parameters it does so by calling
// this method. This updates both the local parameters and those in
// the store.
function inc(delta) {
  _params = store.incParams(_id, _params, delta);
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
  registerParams: registerParams,
  init: init,
  sync: sync,
  get: get,
  inc: inc
};
