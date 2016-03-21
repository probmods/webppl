// Optimizes the parameters of a guide program.

// Takes a wpplFn representing the target and guide and optionally the
// current parameters and returns optimized parameters. (The
// parameters passed in are not modified.)

// If initial parameters are not given, the parameters are initialized
// lazily as specified by the guide.

'use strict';

var assert = require('assert');
var _ = require('underscore');
var util = require('../util');
var optMethods = require('./optMethods');

module.exports = function(env) {

  var estimators = {
    ELBO: require('./elbo')(env),
    EUBO: require('./eubo')(env)
  };

  // Example usage:

  // Optimize(model, {method: 'VI'})
  // Optimize(model, {params: params, method: 'VI'})
  // Optimize(model, {method: 'VI', optimizer: 'adagrad'})

  // Options specific to the estimator or the optimization method are
  // specified in the same way as kernel specific options are
  // specified for MCMC. For example:

  // Optimize(model, {params: params, method: {TT: {traces: traces}}})
  // Optimize(model, {method: 'VI', optimizer: {adagrad: {stepSize: 0.1}}})

  function Optimize(s, k, a, wpplFn, options) {
    options = util.mergeDefaults(options, {
      params: {},
      method: 'gd',
      estimator: 'ELBO',
      steps: 1
    });

    // Create a (cps) function which takes parameters to gradient
    // estimates.
    var estimator = subOptions(options.estimator, function(name, opts) {
      return _.partial(estimators[name], wpplFn, s, a, opts);
    });

    var optimizer = subOptions(options.method, function(name, opts) {
      return optMethods[name](opts);
    });

    // TODO: We'll need to deep copy the input parameters once updates
    // modify parameters in-place.
    var params = _.clone(options.params);

    // Main loop.
    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next) {

          return estimator(params, function(grad) {
            optimizer(params, grad);
            console.log(params);
            return next();
          });

        },

        // Loop continuation.
        function() {
          return k(s, params);
        });

  }

  // 'gd' => cont('gd', {})
  // {gd: options} => cont('gd', options)
  // {gd: options, otherKey: {}} => throw

  function subOptions(obj, cont) {
    var args;
    if (_.isString(obj)) {
      args = [obj, {}];
    } else {
      if (_.size(obj) !== 1) {
        throw 'Invalid options.';
      }
      var key = _.keys(obj)[0];
      args = [key, obj[key]];
    }
    return cont.apply(null, args);
  }

  return {
    Optimize: Optimize
  };

};
