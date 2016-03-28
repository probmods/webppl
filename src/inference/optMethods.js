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
    var options = util.mergeDefaults(options, { stepSize: 0.1 });
    var stepSize = options.stepSize;
    return _.extendOwn(function(params, grad) {
      _.each(grad, function(g, a) {
        assert(_.has(params, a));
        params[a] = generic.sub(params[a], generic.scalarMul(g, stepSize));
      });
    }, { options: options });
  },
  // TODO: The next 3 methods each avoid division by zero in different ways. Unify?
  adagrad: function(options) {
    var options = util.mergeDefaults(options, { stepSize: 0.001 });
    var stepSize = options.stepSize;
    // State.
    // Map from a to running sum of grad^2.
    var g2 = Object.create(null);
    return _.extendOwn(function(params, grad) {
      _.each(grad, function(g, a) {
        assert(_.has(params, a));
        if (!_.has(g2, a)) {
          // Start with small non-zero g2 to avoid divide by zero.
          g2[a] = generic.scalarMul(generic.onesLike(g), 0.001);
        }
        g2[a] = generic.add(g2[a], generic.mul(g, g));
        params[a] = generic.sub(params[a], generic.scalarMul(generic.div(g, generic.sqrt(g2[a])), stepSize));
      });
    }, { options: options });
  },
  // TODO: Make it possible to specify params such as decayRate from within programs.
  rmsprop: function(options) {
    var options = util.mergeDefaults(options, { stepSize: 0.001, decayRate: 0.9 });
    var stepSize = options.stepSize;
    var decayRate = options.decayRate;
    var g2 = Object.create(null);
    return _.extendOwn(function(params, grad) {
      _.each(grad, function(g, a) {
        assert(_.has(params, a));
        if (!_.has(g2, a)) {
          g2[a] = generic.zerosLike(g);
        }
        g2[a] = generic.add(generic.scalarMul(g2[a], decayRate), generic.scalarMul(generic.mul(g, g), 1 - decayRate));
        params[a] = generic.sub(
            params[a],
            generic.scalarMul(generic.div(g, generic.sqrt(generic.scalarAdd(g2[a], 1e-8))), stepSize));
      });
    }, { options: options });
  },
  adam: function(options) {
    var options = util.mergeDefaults(options, {
      stepSize: 0.001, // alpha
      decayRate1: 0.9, // beta1
      decayRate2: 0.999, // beta2
      eps: 1e-8
    });

    var stepSize = options.stepSize;
    var decayRate1 = options.decayRate1;
    var decayRate2 = options.decayRate2;
    var eps = options.eps;

    var m = Object.create(null);
    var v = Object.create(null);
    var t = 0;

    return _.extendOwn(function(params, grad) {
      t += 1;

      _.each(grad, function(g, a) {
        assert(_.has(params, a));
        if (!_.has(m, a)) {
          m[a] = generic.zerosLike(g);
          v[a] = generic.zerosLike(g);
        }
        m[a] = generic.add(generic.scalarMul(m[a], decayRate1), generic.scalarMul(g, 1 - decayRate1));
        v[a] = generic.add(generic.scalarMul(v[a], decayRate2), generic.scalarMul(generic.mul(g, g), 1 - decayRate2));
        //var mHat = scalarDiv(m[a], 1 - Math.pow(decayRate1, t));
        //var vHat = scalarDiv(v[a], 1 - Math.pow(decayRate2, t));
        //params[a] = sub(params[a], scalarMul(div(mHat, scalarAdd(sqrt(vHat), eps)), stepSize));
        var alpha_t = stepSize * Math.sqrt(1 - Math.pow(decayRate2, t)) / (1 - Math.pow(decayRate1, t));
        params[a] = generic.sub(
            params[a],
            generic.scalarMul(generic.div(m[a], generic.scalarAdd(generic.sqrt(v[a]), eps)), alpha_t));
      });
    }, { options: options });
  }
};
