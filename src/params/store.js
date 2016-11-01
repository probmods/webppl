'use strict';

var _ = require('underscore');
var memoryStore = require('./store/memory');

var stores = {
  memory: memoryStore
};

var _store = memoryStore;

function selectStore(name) {
  if (_.has(stores, name)) {
    _store = stores[name];
  } else {
    throw new Error('Parameter store "' + name + '" not found. Valid options: ' + _.keys(stores));
  }
}

function getParams(id) {
  return _store.getParams(id);
}

function incParams(id, params, deltas) {
  return _store.incParams(id, params, deltas);
}

module.exports = {
  selectStore: selectStore,
  getParams: getParams,
  incParams: incParams
};
