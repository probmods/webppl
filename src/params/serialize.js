'use strict';

var _ = require('underscore')
var Tensor = require('../tensor');

function serializeTensor(tensor) {
  return {
    dims: tensor.dims,
    data: tensor.toFlatArray()
  };
}

function serializeParams(paramObj) {
  var prms = _.mapObject(paramObj, function(lst) {
    return lst.map(serializeTensor);
  });
  return prms;
}

function deserializeParams(paramObj) {
  var prms = {};
  for (var name in paramObj) {
    prms[name] = paramObj[name].map(function(tensor) {
      return new Tensor(tensor.dims).fromFlatArray(tensor.data);
    });
  }
  return prms;
}

module.exports = {
  serializeParams: serializeParams,
  deserializeParams: deserializeParams
};
