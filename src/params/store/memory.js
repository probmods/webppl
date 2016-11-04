'use strict';

// The store will call the continuation, but won't return the call,
// or call the trampoline, or pass the global store to it, or anything
// like that. The caller has to make sure that this happens as part
// of the continuation.

var _ = require('underscore');
var paramStruct = require('../struct');

var store = {};

function init(k) {
  return k();
}

// TODO: Figure out whether these deep copies are necessary. Having
// them in is useful for simulating non-local stores, but in the final
// thing we might be able to drop them for improved efficiency?

function getParams(k, id) {
  if (_.has(store, id)) {
    return k(paramStruct.deepCopy(store[id]));
  } else {
    return k({});
  }
}

function incParams(k, id, params, deltas) {
  if (!_.has(store, id)) {
    store[id] = {};
  }
  var table = store[id];
  _.defaults(table, params);
  paramStruct.addEq(table, deltas);
  return k(paramStruct.deepCopy(table));
}

module.exports = {
  init: init,
  getParams: getParams,
  incParams: incParams
};
