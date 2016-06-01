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
var optMethods = require('adnn/opt');
var paramStruct = require('../paramStruct');


module.exports = function(env) {

  var estimators = {
    ELBO: require('./elbo')(env),
    EUBO: require('./eubo')(env)
  };

  function Optimize(s, k, a, wpplFn, options) {
    options = util.mergeDefaults(options, {
      params: {},
      method: 'gd',
      estimator: 'ELBO',
      steps: 1,
      clip: false,              // false = no clipping, otherwise specifies threshold.
      showGradNorm: false,
      debug: true,              // TODO: Switch default before merging.
      verbose: true,
      onFinish: function(s, k, a) { return k(s); }
    });

    // Create a (cps) function which takes parameters to gradient
    // estimates.
    var estimator = subOptions(options.estimator, function(name, opts) {
      opts = util.mergeDefaults(opts, _.pick(options, 'verbose', 'debug'));
      return _.partial(estimators[name], wpplFn, s, a, opts);
    });

    var optimizer = subOptions(options.method, function(name, opts) {
      name = (name === 'gd') ? 'sgd' : name;
      return optMethods[name](opts);
    });

    var paramObj = paramStruct.deepCopy(options.params);

    var showProgress = _.throttle(function(i, objective) {
      console.log('Iteration ' + i + ': ' + objective);
    }, 200, { trailing: false });

    var history = [];

    // Main loop.
    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next) {

          return estimator(paramObj, i, function(gradObj, objective) {
            if (options.debug) {
              checkGradients(gradObj);
            }

            if (options.clip || options.showGradNorm) {
              var norm = paramStruct.norm(gradObj);
              if (options.showGradNorm) {
                console.log('L2 norm of gradient: ' + norm);
              }
              if (options.clip) {
                paramStruct.clip(gradObj, options.clip, norm);
              }
            }

            if (options.verbose) {
              showProgress(i, objective);
            }

            history.push(objective);

            optimizer(gradObj, paramObj, i);

            return next();
          });

        },

        // Loop continuation.
        function() {
          return options.onFinish(s, function(s) {
            return k(s, paramObj);
          }, a, {history: history});
        });

  }

  function allZero(tensor) {
    return !tensor.anyreduce();
  }

  function allFinite(tensor) {
    return tensor.data.every(_.isFinite);
  }

  function checkGradients(gradObj) {
    // Emit warning when component of gradient is zero.
    _.each(gradObj, function(grads, name) {
      _.each(grads, function(g, i) {
        if (allZero(g)) {
          logGradWarning(name, i, 'zero');
        }
        if (!allFinite(g)) {
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
