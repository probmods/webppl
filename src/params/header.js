'use strict';

var _ = require('lodash');
var ad = require('../ad');
var Tensor = require('../tensor');
var util = require('../util');
var dists = require('../dists');
var config = require('./config');
var params = require('./params');


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


module.exports = function(env) {

  var dimsForScalarParam = [1];

  // param provides a convenient wrapper around the primitive
  // params.register.
  var param = function(s, k, a, options) {
    options = util.mergeDefaults(options, {
      mu: 0,
      sigma: .1,
      dims: dimsForScalarParam
    });

    if (!env.coroutine._guide) {
      util.warn('Warning: Parameter created outside of the guide.', true);
    }

    var mu = options.mu;
    var sigma = options.sigma;
    var dims = options.dims;
    var name = _.has(options, 'name') ? options.name : util.relativizeAddress(env, a);

    var val = params.register(env, name, function() {

      // Initialization.

      var val = new Tensor(dims);
      if (sigma === 0) {
        val.fill(mu);
      } else {
        for (var i = 0; i < val.length; i++) {
          val.data[i] = dists.gaussianSample(mu, sigma);
        }
      }

      // params.register tracks an array of parameters for each
      // name/address.
      return [val];

    })[0];
    return k(s, dims === dimsForScalarParam ? ad.tensor.get(val, 0) : val);
  };

  // Fetch the parameters for an adnn neural net.
  var adnnParams = function(s, k, a, net) {
    if (!(net && net.name)) {
      throw new Error('A network with a non-empty name is required.');
    }
    if (!net.isTraining) {
      net.setTraining(true);
    }
    var p = params.register(env, net.name, function() {
      return net.getParameters().map(ad.value);
    });
    return k(s, p);
  };

  return {
    getParams: getParams,
    getParamsId: getParamsId,
    param: param,
    adnnParams: adnnParams,
    setFreshParamsId: setFreshParamsId,
    setParams: setParams,
    setParamsId: setParamsId
  };
};
