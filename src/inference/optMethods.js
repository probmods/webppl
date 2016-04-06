'use strict';

var assert = require('assert');
var _ = require('underscore');
var util = require('../util');
var generic = require('../generic');

// TODO: Implement AdaDelta: http://arxiv.org/abs/1212.5701
// (dritchie: I've found this to be the best overall method, for my
//    tutorial training experiments on procedural models, anyway)

module.exports = {

  gd: function(options) {
    options = util.mergeDefaults(options, {stepSize: 0.1});
    var stepSize = options.stepSize;

    return function(params, grads, step, name) {
      for (var i = 0; i < grads.length; i++) {
        params[i] = generic.sub(params[i], generic.scalarMul(grads[i], stepSize));
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
          return generic.scalarMul(generic.onesLike(g), 0.001);
        });
      }

      var g2 = g2Obj[name];
      for (var i = 0; i < grads.length; i++) {
        g2[i] = generic.add(g2[i], generic.mul(grads[i], grads[i]));
        params[i] = generic.sub(params[i], generic.scalarMul(generic.div(grads[i], generic.sqrt(g2[i])), stepSize));
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
          return generic.zerosLike(g);
        });
      }

      var g2 = g2Obj[name];
      for (var i = 0; i < grads.length; i++) {

        g2[i] = generic.add(generic.scalarMul(g2[i], decayRate),
                            generic.scalarMul(generic.mul(grads[i], grads[i]), 1 - decayRate));

        params[i] = generic.sub(
            params[i],
            generic.scalarMul(
                generic.div(
                    grads[i],
                    generic.sqrt(generic.scalarAdd(g2[i], 1e-8))),
                stepSize));
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
        mObj[name] = grads.map(generic.zerosLike);
        vObj[name] = grads.map(generic.zerosLike);
      }

      var m = mObj[name];
      var v = vObj[name];

      for (var i = 0; i < grads.length; i++) {
        m[i] = generic.add(generic.scalarMul(m[i], decayRate1),
                           generic.scalarMul(grads[i], 1 - decayRate1));
        v[i] = generic.add(generic.scalarMul(v[i], decayRate2),
                           generic.scalarMul(generic.mul(grads[i], grads[i]), 1 - decayRate2));

        var alpha_t = stepSize * Math.sqrt(1 - Math.pow(decayRate2, t)) / (1 - Math.pow(decayRate1, t));
        params[i] = generic.sub(
            params[i],
            generic.scalarMul(
                generic.div(
                    m[i],
                    generic.scalarAdd(generic.sqrt(v[i]), eps)),
                alpha_t));
      }
    };
  }

};
