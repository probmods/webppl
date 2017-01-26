// Gradient based optimization of parameters.

'use strict';

var assert = require('assert');
var _ = require('lodash');
var nodeutil = require('util');
var present = require('present');
var util = require('../util');
var optMethods = require('adnn/opt');
var paramStruct = require('../params/struct');
var params = require('../params/params');
var weightDecay = require('./weightDecay');
var fs = require('fs');
var nodeUtil = require('util');

module.exports = function(env) {

  var estimators = {
    ELBO: require('./elbo')(env),
    EUBO: require('./eubo')(env),
    dream: require('./dream/estimator')(env)
  };

  function Optimize(s, k, a, fnOrOptions, maybeOptions) {
    var wpplFn, options;
    if (_.isFunction(fnOrOptions)) {
      wpplFn = fnOrOptions;
      options = maybeOptions;
    } else if (util.isObject(fnOrOptions)) {
      wpplFn = fnOrOptions.model;
      options = _.omit(fnOrOptions, 'model');
      if (!_.isFunction(wpplFn) && _.isFunction(maybeOptions)) {
        throw new Error('Optimize: expected model to be included in options.');
      }
    } else {
      throw new Error('Optimize: expected first argument to be an options object or a function.');
    }

    if (!_.isFunction(wpplFn)) {
      throw new Error('Optimize: a model was not specified.');
    }

    options = util.mergeDefaults(options, {
      optMethod: 'adam',
      estimator: 'ELBO',
      steps: 1,
      clip: false,              // false = no clipping, otherwise specifies threshold.
      weightDecay: 0,
      showGradNorm: false,
      checkGradients: true,
      verbose: true,
      onFinish: function(s, k, a) { return k(s); },

      logProgress: false,
      logProgressFilename: 'optimizeProgress.csv',
      logProgressThrottle: 200,

      checkpointParams: false,
      checkpointParamsFilename: 'optimizeParams.json',
      checkpointParamsThrottle: 10000
    });

    // Create a (cps) function 'estimator' which computes gradient
    // estimates based on the (local copy) of the current parameter
    // set. Every application of the estimator function is passed the
    // 'state' variable. This allows an estimator to maintain state
    // between calls by modifying the contents of this object.
    var state = {};
    var estimator = util.getValAndOpts(options.estimator, function(name, opts) {
      if (!_.has(estimators, name)) {
        throw new Error('Optimize: ' + name + ' is not a valid estimator. ' +
                        'The following estimators are available: ' +
                        _.keys(estimators).join(', ') + '.');
      }
      opts = util.mergeDefaults(opts, _.pick(options, 'verbose'));
      return _.partial(estimators[name], wpplFn, s, a, opts, state);
    });

    var optimizer = util.getValAndOpts(options.optMethod, function(name, opts) {
      name = (name === 'gd') ? 'sgd' : name;
      return optMethods[name](opts);
    });

    var showProgress = _.throttle(function(i, objective) {
      console.log('Iteration ' + i + ': ' + objective);
    }, 200, { trailing: false });

    var history = [];

    // For writing progress to disk
    var logFile, logProgress;
    if (options.logProgress) {
      logFile = fs.openSync(options.logProgressFilename, 'w');
      fs.writeSync(logFile, 'index,iter,time,objective\n');
      var ncalls = 0;
      var starttime = present();
      logProgress = _.throttle(function(i, objective) {
        var t = (present() - starttime) / 1000;
        fs.writeSync(logFile, nodeUtil.format('%d,%d,%d,%d\n', ncalls, i, t, objective));
        ncalls++;
      }, options.logProgressThrottle, { trailing: false });
    }

    // For checkpointing params to disk
    var saveParams, checkpointParams;
    if (options.checkpointParams) {
      saveParams = function() {
        params.save(options.checkpointParamsFilename);
      };
      checkpointParams = _.throttle(saveParams, options.checkpointParamsThrottle, { trailing: false });
    }

    // Weight decay.
    var decayWeights = weightDecay.parseOptions(options.weightDecay, options.verbose);

    // Main loop.
    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next) {

          return estimator(i, function(gradObj, objective) {
            if (options.checkGradients) {
              checkGradients(gradObj);
            }
            if (options.verbose) {
              showProgress(i, objective);
            }
            if (options.logProgress) {
              logProgress(i, objective);
            }
            if (options.checkpointParams) {
              checkpointParams();
            }

            history.push(objective);

            // Retrieve latest params from store
            return params.sync(function(paramsObj) {

              decayWeights(gradObj, paramsObj);

              if (options.clip || options.showGradNorm) {
                var norm = paramStruct.norm(gradObj);
                if (options.showGradNorm) {
                  console.log('L2 norm of gradient: ' + norm);
                }
                if (options.clip) {
                  paramStruct.clip(gradObj, options.clip, norm);
                }
              }

              // Update local copy of params
              optimizer(gradObj, paramsObj, i);

              // Send updated params to store
              return params.set(paramsObj, next);

            }, { incremental: true });

          });

        },

        // Loop continuation.
        function() {
          return options.onFinish(s, function(s) {
            if (options.logProgress) {
              fs.closeSync(logFile);
            }
            if (options.checkpointParams) {
              // Save final params
              saveParams();
            }
            return k(s);
          }, a, {history: history});
        });

  }

  function allZero(tensor) {
    return !tensor.anyreduce();
  }

  function allFinite(tensor) {
    return _.every(tensor.data, isFinite);
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

  function logGradWarning(name, i, problem) {
    util.warn('Gradient for param ' + name + ':' + i + ' is ' + problem + '.', true);
  }

  return {
    Optimize: Optimize
  };

};
