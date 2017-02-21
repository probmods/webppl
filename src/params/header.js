'use strict';

var _ = require('lodash');
var ad = require('../ad');
var Tensor = require('../tensor');
var util = require('../util');
var dists = require('../dists');
var config = require('./config');
var params = require('./params');
var serialize = require('./serialize');


function getParams(s, k, a) {
  return k(s, params.get());  // params.get is not a cps function
}

function setParams(s, k, a, prms) {
  return params.set(prms, function() { return k(s); });
}

function setParamsId(s, k, a, id) {
  config.setId(id);
  return params.sync(function() {
    return k(s, id);
  });
}

function setFreshParamsId(s, k, a) {
  var id = config.setFreshId();
  return params.sync(function() {
    return k(s, id);
  });
}

function getParamsId(s, k, a, id) {
  return k(s, config.getId());
}

function serializeParams(s, k, a, paramsObj) {
  return k(s, serialize.serializeParams(paramsObj));
}

function deserializeParams(s, k, a, str) {
  return k(s, serialize.deserializeParams(str));
}

function defaultInit(mu, sigma) {
  return function(s, k, a, dims) {
    return k(s, dists.tensorGaussianSample(mu, sigma, dims));
  };
}

module.exports = function(env) {

  var dimsForScalarParam = [1];

  var param = function(s, k, a, options) {
    options = util.mergeDefaults(options, {
      mu: 0,
      sigma: .1,
      dims: dimsForScalarParam
    });

    if (!env.coroutine._guide) {
      util.warn('Warning: Parameter created outside of the guide.', true);
    }

    var dims = options.dims;
    var name = _.has(options, 'name') ? options.name : util.relativizeAddress(env, a);

    if (params.exists(name)) {
      return finish(s);
    } else {
      var init = _.has(options, 'init') ? options.init : defaultInit(options.mu, options.sigma);
      if (!_.isFunction(init)) {
        throw new Error('Expected the init argument to be a function.');
      }
      return init(s, function(s, initialVal) {
        params.create(name, initialVal);
        if (!_.isEqual(dims, initialVal.dims)) {
          var msg = 'The init function did not return a tensor with the expected shape.';
          throw new Error(msg);
        }
        return finish(s);
      }, a, dims);
    }

    function finish(s) {
      var val = params.fetch(name, env);
      var valDims = ad.value(val).dims;
      if (!_.isEqual(dims, valDims)) {
        var msg = 'The dims specified here (' + JSON.stringify(dims) +
            ') do not match the dims of the current value (' +
            JSON.stringify(valDims) + '). The current value may ' +
            'come from an earlier call to param, or from a previous ' +
            'execution when a persistent parameter store is used.';
        throw new Error(msg);
      }
      return k(s, dims === dimsForScalarParam ? ad.tensor.get(val, 0) : val);
    };
  };

  return {
    getParams: getParams,
    getParamsId: getParamsId,
    param: param,
    setFreshParamsId: setFreshParamsId,
    setParams: setParams,
    setParamsId: setParamsId,
    serializeParams: serializeParams,
    deserializeParams: deserializeParams
  };
};
