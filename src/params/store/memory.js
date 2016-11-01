'use strict';

var _ = require('underscore');
var paramStruct = require('../struct');

var store = {};

function getParams(id) {
  if (_.has(store, id)) {
    return paramStruct.deepCopy(store[id]);
  } else {
    return {};
  }
}

function incParams(id, params, deltas) {
  if (!_.has(store, id)) {
    store[id] = {};
  }
  var table = store[id];
  _.defaults(table, params);
  paramStruct.addEq(table, deltas);
  return paramStruct.deepCopy(table);
}

module.exports = {
  getParams: getParams,
  incParams: incParams
};
