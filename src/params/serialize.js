'use strict';

var _ = require('lodash')
var Tensor = require('../tensor');

function tensorToObject(tensor) {
  return {
    dims: tensor.dims,
    data: tensor.toFlatArray()
  };
}

function tensorsToObjects(paramObj) {
  var prms = _.mapValues(paramObj, function(lst) {
    return lst.map(tensorToObject);
  });
  return prms;
}

function objectsToTensors(paramObj) {
  var prms = {};
  for (var name in paramObj) {
    prms[name] = paramObj[name].map(function(tensor) {
      return new Tensor(tensor.dims).fromFlatArray(tensor.data);
    });
  }
  return prms;
}

function serializeParams(paramObj) {
  return JSON.stringify(tensorsToObjects(paramObj));
}

function deserializeParams(str) {
  return objectsToTensors(JSON.parse(str));
}

module.exports = {
  tensorsToObjects: tensorsToObjects,
  objectsToTensors: objectsToTensors,
  serializeParams: serializeParams,
  deserializeParams: deserializeParams
};
