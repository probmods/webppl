'use strict';

var _ = require('lodash');
var ad = require('../ad');
var Tensor = require('../tensor');
var util = require('../util');
var dists = require('../dists');
var config = require('./config');
var params = require('./params');
var serialize = require('./serialize');
var ortho = require('../math/ortho');

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

module.exports = function(env) {

  var dimsForScalarParam = [1];

  // param provides a convenient wrapper around the primitive
  // params.register.
  var param = function(s, k, a, options) {
    options = util.mergeDefaults(options, {
      mu: 0,
      sigma: .1,
      dims: dimsForScalarParam,
      init: 'rand'
    });

    if (!env.coroutine._guide) {
      util.warn('Warning: Parameter created outside of the guide.', true);
    }

    var mu = options.mu;
    var sigma = options.sigma;
    var dims = options.dims;
    var name = _.has(options, 'name') ? options.name : util.relativizeAddress(env, a);
    var init = options.init;

    assert.ok(_.contains('rand randLowVar id zero xavierUni xavier xavierAvg xavierAvg3 ortho'.split(' '), init), 'Unknown initialization specified.');

    if (init === 'id') {
      assert.ok(dims.length === 2 && dims[0] === dims[1]);
    }
    debugger;
    var val = params.register(env, name, function() {

      // Initialization.

      var val = new Tensor(dims);
      debugger;
      if (init === 'rand') {
        if (sigma === 0) {
          val.fill(mu);
        } else {
          for (var i = 0; i < val.length; i++) {
            val.data[i] = dists.gaussianSample(mu, sigma);
          }
        }
      } else if (init === 'zero') {
        val.fill(mu);
      } else if (init === 'randLowVar') {
        if (sigma === 0) {
          val.fill(mu);
        } else {
          for (var i = 0; i < val.length; i++) {
            val.data[i] = dists.gaussianSample(mu, 0.01);
          }
        }
      } else if (init === 'id') {
        // Initialize to identity matrix.
        for (var j = 0; j < dims[0]; j++) {
          val.data[j * (dims[0] + 1)] = 1;
        }
      }  else if (init === 'xavier') {
        debugger;
        var scale;
        if (val.rank === 1) { // TODO: works for [o,1]? + why not isMatrix?
          // Init. biases to tiny values to avoid zero gradient warnings
          // on first optimization step.
          throw new Error('Shouldnt happen!!!');
          scale = 0;//1e-5;
        } else if (val.rank === 2) {
          scale = 1 / Math.sqrt(val.dims[1]);
        } else {
          throw new Error('param: xavier init. can only be applied to vectors and matrices.');
        }
        var n = val.length;
        while (n--) {
          val.data[n] = dists.gaussianSample(0, scale);
        }
      } else if (init === 'xavierAvg') {

        var scale;
        if (val.rank === 1) {
          // Init. biases to tiny values to avoid zero gradient warnings
          // on first optimization step.
          throw new Error('Shouldnt happen!!!');
          scale = 0;//1e-5;
        } else if (val.rank === 2) {
          scale = Math.sqrt(2 / (val.dims[0] + val.dims[1]));
        } else {
          throw new Error('param: xavier init. can only be applied to vectors and matrices.');
        }
        var n = val.length;
        while (n--) {
          val.data[n] = dists.gaussianSample(0, scale);
        }


      } else if (init === 'xavierUni') {

        var n = val.length;
        if (val.rank === 1) {
          // Init. biases to tiny values to avoid zero gradient warnings
          // on first optimization step.
          throw new Error('Shouldnt happen!!!');
          var scale = 0;//1e-5;
          while (n--) {
            val.data[n] = dists.gaussianSample(0, scale);
          }
        } else if (val.rank === 2) {
          var b = Math.sqrt(6 / (val.dims[0] + val.dims[1]));
          var a = -b;
          while (n--) {
            var u = util.random();
            val.data[n] = (1 - u) * a + u * b;
          }
        } else {
          throw new Error('param: xavier init. can only be applied to vectors and matrices.');
        }

      } else if (init === 'xavierAvg3') {

        var scale;
        if (val.rank === 1) {
          // Init. biases to tiny values to avoid zero gradient warnings
          // on first optimization step.
         throw new Error('Shouldnt happen!!!');
          scale = 0;//1e-5;
        } else if (val.rank === 2) {
          scale = Math.sqrt(3 / (val.dims[0] + val.dims[1]));
        } else {
          throw new Error('param: xavier init. can only be applied to vectors and matrices.');
        }
        var n = val.length;
        while (n--) {
          val.data[n] = dists.gaussianSample(0, scale);
        }


      } else if (init === 'ortho') {
        if (dims.length !== 2) {
          throw new Error('ortho init. can only be applied to matrices.');
        }
        for (var i = 0; i < val.length; i++) {
          val.data[i] = dists.gaussianSample(0, 1);
        }
        val = ortho(val);
      } else {
        throw new Error('Unreachable.');
      }

      // params.register tracks an array of parameters for each
      // name/address.
      return [val];

    })[0];
    return k(s, dims === dimsForScalarParam ? ad.tensor.get(val, 0) : val);
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
