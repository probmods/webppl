'use strict';

var assert = require('assert');
var _ = require('underscore');
var util = require('../util');
var Tensor = require('../tensor');

// TODO: Implement AdaDelta: http://arxiv.org/abs/1212.5701

function zerosLike(tensor) {
  return new Tensor(tensor.dims);
}

function onesLike(tensor) {
  return new Tensor(tensor.dims).fill(1);
}

module.exports = {

  gd: function(options) {
    options = util.mergeDefaults(options, {
      stepSize: 0.1,
      mu: 0 // mu > 0 yields gradient descent with 'momentum'
    });
    var stepSize = options.stepSize;
    var mu = options.mu;

    // Map from name to an array of 'velocity' tensors.
    var vObj = {};

    return function(params, grads, step, name) {
      if (!_.has(vObj, name)) {
        vObj[name] = grads.map(function(g) {
          return zerosLike(g);
        });
      }
      var v = vObj[name];
      for (var i = 0; i < grads.length; i++) {
        v[i] = (v[i].mul(mu)).sub(grads[i].mul(stepSize));
        params[i] = params[i].add(v[i]);
      }
    };
  },

  // TODO: The next 3 methods each avoid division by zero in different ways. Unify?
  adagrad: function(options) {
    options = util.mergeDefaults(options, {stepSize: 0.001});
    var stepSize = options.stepSize;
    // State.
    // Map from name to an array of running sums of grad^2.
    var g2Obj = {};

    return function(params, grads, step, name) {
      if (!_.has(g2Obj, name)) {
        g2Obj[name] = grads.map(function(g) {
          // Start with small non-zero g2 to avoid divide by zero.
          return onesLike(g).mul(0.001);
        });
      }

      var g2 = g2Obj[name];
      for (var i = 0; i < grads.length; i++) {
        g2[i] = g2[i].add(grads[i].mul(grads[i]));
        params[i] = params[i].sub(grads[i].div(g2[i].sqrt()).mul(stepSize));
      }
    };
  },

  rmsprop: function(options) {
    options = util.mergeDefaults(options, {stepSize: 0.001, decayRate: 0.9});
    var stepSize = options.stepSize;
    var decayRate = options.decayRate;

    var g2Obj = {};

    return function(params, grads, step, name) {
      if (!_.has(g2Obj, name)) {
        g2Obj[name] = grads.map(function(g) {
          return zerosLike(g);
        });
      }

      var g2 = g2Obj[name];
      for (var i = 0; i < grads.length; i++) {
        g2[i] = g2[i].mul(decayRate).add(grads[i].mul(grads[i]).mul(1 - decayRate));
        params[i] = params[i].sub(grads[i].div(g2[i].add(1e-8).sqrt()).mul(stepSize));
      }
    };
  },

  adam: function(options) {
    options = util.mergeDefaults(options, {
      stepSize: 0.001, // alpha
      decayRate1: 0.9, // beta1
      decayRate2: 0.999, // beta2
      eps: 1e-8
    });

    var stepSize = options.stepSize;
    var decayRate1 = options.decayRate1;
    var decayRate2 = options.decayRate2;
    var eps = options.eps;

    var mObj = {};
    var vObj = {};

    return function(params, grads, step, name) {
      // We want t=1 on the first iteration. step starts at zero.
      var t = step + 1;

      if (!_.has(mObj, name)) {
        mObj[name] = grads.map(zerosLike);
        vObj[name] = grads.map(zerosLike);
      }

      var m = mObj[name];
      var v = vObj[name];

      for (var i = 0; i < grads.length; i++) {
        m[i] = m[i].mul(decayRate1).add(grads[i].mul(1 - decayRate1));
        v[i] = v[i].mul(decayRate2).add(grads[i].mul(grads[i]).mul(1 - decayRate2));

        var alpha_t = stepSize * Math.sqrt(1 - Math.pow(decayRate2, t)) / (1 - Math.pow(decayRate1, t));
        params[i] = params[i].sub(m[i].div(v[i].sqrt().add(eps)).mul(alpha_t));
      }
    };
  }

};
