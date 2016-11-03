'use strict';

var _ = require('underscore');
var ad = require('../ad');
var config = require('./config');


module.exports = function(env) {

  function resumeTrampoline(s, k, v) {
    // FIXME: Without setImmediate, we run into stack overflow errors
    // when using the in-memory store. With setImmediate, we're breaking
    // our inference tests (since they don't support async behavior at
    // the moment).
    setImmediate(function() {
      env.runner(function() { return k(s, v) });
    });
  }

  function sanityCheck() {
    // If errors are throw from here, it may be that two or more calls
    // to require are returning distinct instances of this module,
    // preventing the correct sharing of _id and _store.
    var id = config.getId();
    if (id === undefined) {
      throw new Error('Expected the parameter set id to be defined.');
    }
  }

  // We call this whenever we run a new webppl programs.
  // Sync resumes the trampoline, so we don't have to do it here.
  function init(s, k) {
    if (!config.isManualId()) {
      config.setFreshId();
    }
    var store = config.getStore();
    store.init(function() { sync(s, k); });
  }

  function sync(s, k) {
    sanityCheck();
    var store = config.getStore();
    var next = function(params) {
      if (!params) {
        throw new Error('Expected store to return params, got', params);
      }
      env.params = params;
      resumeTrampoline(s, k, params);
    };
    store.getParams(next, config.getId());
  }

  function get() {
    sanityCheck();
    return env.params;
  }

  // When a coroutine wishes to update parameters it does so by calling
  // this method. This updates both the local parameters and those in
  // the store.
  function inc(s, k, deltas) {
    sanityCheck();
    var id = config.getId();
    var store = config.getStore();
    var next = function(params) {
      if (!params) {
        throw new Error('Expected store to return params, got', params);
      }
      env.params = params;
      resumeTrampoline(s, k, params);
    };
    store.incParams(next, id, env.params, deltas);
  }


  var register = function(name, initParams, setParams) {

    // initParams is expected to be a function which is used to
    // initialize parameters the first time they are encoutered. At
    // present I consider it to be `register` responsibility to
    // perform lifting of params, so ideally `initParams` would not
    // return lifted params. However, in the case of NN, `initParams`
    // returns params already lifted. Hence, `initParams()` is replaced
    // with `initParams().map(ad.value)` throughout this function.

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
        var _params = initParams().map(ad.value);
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

  return {
    get: get,
    inc: inc,
    init: init,
    register: register,
    sync: sync
  };

};
