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
  return _.mapValues(paramObj, tensorToObject);
}

function objectsToTensors(paramObj) {
  return _.mapValues(paramObj, function(tensor) {
    return new Tensor(tensor.dims).fromFlatArray(tensor.data);
  });
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
