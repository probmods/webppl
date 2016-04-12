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
var generic = require('../generic');

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
      steps: 1,
      debug: true,              // TODO: Switch default before merging.
      verbose: true
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
    var paramObj = _.mapObject(options.params, function(arr) {
      return arr.slice();
    });

    var showProgress = _.throttle(function(i, objective) {
      console.log('Iteration ' + i + ': ' + objective);
    }, 200, { trailing: false });

    // Main loop.
    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next) {

          return estimator(paramObj, function(gradObj, objective) {
            if (options.debug) {
              checkGradients(gradObj);
            }

            if (options.verbose) {
              showProgress(i, objective);
            }

            _.each(gradObj, function(grads, name) {
              assert.ok(_.has(paramObj, name));
              var params = paramObj[name];
              assert.strictEqual(params.length, grads.length);
              optimizer(params, grads, i, name);
            });

            return next();
          });

        },

        // Loop continuation.
        function() {
          return k(s, paramObj);
        });

  }

  function checkGradients(gradObj) {
    // Emit warning when component of gradient is zero.
    _.each(gradObj, function(grads, name) {
      _.each(grads, function(g, i) {
        if (generic.allZero(g)) {
          logGradWarning(name, i, 'zero');
        }
        if (!generic.allFinite(g)) {
          // Catches NaN, ±Infinity.
          logGradWarning(name, i, 'not finite');
        }
      });
    });
  }

  var issuedGradWarning = {};

  function logGradWarning(name, i, problem) {
    var key = name + i + problem;
    if (!_.has(issuedGradWarning, key)) {
      console.warn('Gradient for param ' + name + ':' + i + ' is ' + problem + '.');
      issuedGradWarning[key] = true;
    }
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
