'use strict';

var _ = require('underscore');
var paramStruct = require('../struct');


var store = {};

function start(k) {
  return k();
}

function stop(k) {
  return k();
}

// The deep copies below are useful for simulating non-local stores,
// (as a way of checking that we aren't reaching into the store from the
// outside and making modifications), but probably not strictly necessary.
// They don't seem to significantly affect efficiency so far, but if they
// do in the future, we could add a flag that turns them off.

function getParams(id, k) {
  if (_.has(store, id)) {
    return k(paramStruct.deepCopy(store[id]));
  } else {
    return k({});
  }
}

function setParams(id, params, k) {
  store[id] = paramStruct.deepCopy(params);
  return k();
}

function incParams(id, params, deltas, k) {
  if (!_.has(store, id)) {
    store[id] = {};
  }
  var table = store[id];
  _.defaults(table, params);
  paramStruct.addEq(table, deltas);
  return k(paramStruct.deepCopy(table));
}


module.exports = {
  start: start,
  stop: stop,
  getParams: getParams,
  setParams: setParams,
  incParams: incParams
};
