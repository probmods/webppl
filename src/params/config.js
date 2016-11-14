'use strict';

var _ = require('underscore');
var memoryStore = require('./store/memory');
var mongoStore = require('./store/mongo');


// Parameter set id

var _id;
var _isManualId = false;

function setFreshId() {
  _id = 'params-' + Math.random().toString(36).substring(2, 10);
  _isManualId = false;
  return _id;
}

function setId(id) {
  _id = id;
  _isManualId = true;
  return _id;
}

function getId() {
  return _id;
}

function isManualId() {
  return _isManualId;
}


// Store

var stores = {
  memory: memoryStore,
  mongo: mongoStore
};

var _store = memoryStore;

function setStore(name) {
  if (_.has(stores, name)) {
    _store = stores[name];
  } else {
    throw new Error('Parameter store "' + name + '" not found. ' +
                    'Valid options: ' + _.keys(stores));
  }
}

function getStore() {
  return _store;
}


module.exports = {
  setFreshId: setFreshId,
  setId: setId,
  getId: getId,
  isManualId: isManualId,
  getStore: getStore,
  setStore: setStore
};
