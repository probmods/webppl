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

// TODO: Figure out whether these deep copies are necessary. Having
// them in is useful for simulating non-local stores, but in the final
// thing we might be able to drop them for improved efficiency?

function getParams(id, k) {
  if (_.has(store, id)) {
    return k(paramStruct.deepCopy(store[id]));
  } else {
    return k({});
  }
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
  incParams: incParams
};
