// Optimizes the parameters of a guide program.

// Takes a wpplFn representing the target and guide and optionally the
// current parameters and returns optimized parameters. (The
// parameters passed in are not modified.)

// If initial parameters are not given, the parameters are initialized
// lazily as specified by the guide.

'use strict';

var assert = require('assert');
var _ = require('underscore');
var fs = require('fs');
var nodeutil = require('util');
var present = require('present');
var util = require('../util');
var optMethods = require('adnn/opt');
var paramStruct = require('../paramStruct');


module.exports = function(env) {

  var estimators = {
    ELBO: require('./elbo')(env),
    ELBO2: require('./elbo2')(env),
    EUBO: require('./eubo')(env)
  };

  function Optimize(s, k, a, wpplFn, options) {
    options = util.mergeDefaults(options, {
      params: {},
      optMethod: 'adam',
      estimator: 'ELBO',
      steps: 1,
      clip: false,              // false = no clipping, otherwise specifies threshold.
      showGradNorm: false,
      checkGradients: true,
      verbose: true,
      logProgress: false,      // can use an object with {filename:, timeinterval:} properties
      onFinish: function(s, k, a) { return k(s); }
    });

    // Create a (cps) function which takes parameters to gradient
    // estimates.
    var state = {};
    var estimator = util.getValAndOpts(options.estimator, function(name, opts) {
      opts = util.mergeDefaults(opts, _.pick(options, 'verbose'));
      return _.partial(estimators[name], wpplFn, s, a, opts, state);
    });

    var optimizer = util.getValAndOpts(options.optMethod, function(name, opts) {
      name = (name === 'gd') ? 'sgd' : name;
      return optMethods[name](opts);
    });

    var paramObj = paramStruct.deepCopy(options.params);

    var showProgress = _.throttle(function(i, objective) {
      console.log('Iteration ' + i + ': ' + objective);
    }, 200, { trailing: false });

    var history = [];

    var logfile, logProgress;
    if (options.logProgress) {
      logfile = fs.openSync(options.logProgress, 'w');
      fs.writeSync(logfile, 'index,iter,time,objective\n');

      var ncalls = 0;
      var starttime = present();
      logProgress = _.throttle(function(i, objective) {
        var t = (present() - starttime)/1000;
        fs.writeSync(logfile, nodeutil.format('%d,%d,%d,%d\n', ncalls, i, t, objective));
        ncalls++;
      }, 200, { trailing: false });
    }

    // Main loop.
    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next) {

          return estimator(paramObj, i, function(gradObj, objective) {
            if (options.checkGradients) {
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
            if (options.logProgress) {
              logProgress(i, objective);
            }

            history.push(objective);

            optimizer(gradObj, paramObj, i);

            return next();
          });

        },

        // Loop continuation.
        function() {
          return options.onFinish(s, function(s) {
            if (options.logProgress) {
              fs.closeSync(logfile);
            }
            return k(s, paramObj);
          }, a, {history: history});
        });

  }

  function allZero(tensor) {
    return !tensor.anyreduce();
  }

  function allFinite(tensor) {
    return _.all(tensor.data, _.isFinite);
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

  return {
    Optimize: Optimize
  };

};
