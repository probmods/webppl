'use strict';

var _ = require('underscore');
var ad = require('../ad');
var Tensor = require('../tensor');
var util = require('../util');
var dists = require('../dists');

module.exports = function(env) {

  var params = require('./params')(env);

  var dimsForScalarParam = [1];

  // param provides a convenient wrapper around the primitive
  // params.register.
  var param = function(s, k, a, options) {
    options = util.mergeDefaults(options, {
      mu: 0,
      sigma: .1,
      dims: dimsForScalarParam
    });
    var mu = options.mu;
    var sigma = options.sigma;
    var dims = options.dims;
    var name = _.has(options, 'name') ? options.name : util.relativizeAddress(env, a);

    var val = params.register(name, function() {

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

  var getParams = function(s, k, a) {
    return k(s, params.get());
  };

  var initParams = function(s, k, a) {
    return params.init(s, k);
  };

  return {
    param: param,
    getParams: getParams,
    initParams: initParams
  };
};
