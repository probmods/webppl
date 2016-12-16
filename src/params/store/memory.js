'use strict';

var _ = require('underscore');
var paramStruct = require('../struct');


// When SAFE_MODE is true, we deep-copy params before returning
// them. This is useful for simulating non-local stores, (as a way of
// checking that we aren't reaching into the store from the
// outside and making modifications).

var SAFE_MODE = false;

function copyIfSafeMode(params) {
  return SAFE_MODE ? paramStruct.deepCopy(params) : params;
}


var store = {};

function start(k) {
  return k();
}

function stop(k) {
  return k();
}

function getParams(id, k) {
  if (_.has(store, id)) {
    return k(copyIfSafeMode(store[id]));
  } else {
    return k({});
  }
}

function setParams(id, params, k) {
  store[id] = copyIfSafeMode(params);
  return k();
}

function incParams(id, params, deltas, k) {
  if (!_.has(store, id)) {
    store[id] = {};
  }
  var table = store[id];
  _.defaults(table, params);
  paramStruct.addEq(table, deltas);
  return k(copyIfSafeMode(table));
}


module.exports = {
  start: start,
  stop: stop,
  getParams: getParams,
  setParams: setParams,
  incParams: incParams
};
