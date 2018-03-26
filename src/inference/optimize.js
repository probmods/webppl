// Gradient based optimization of parameters.

'use strict';

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

  var applyd = require('../headerUtils')(env).applyd;
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
      verbose: false,
      onStep: function(s, k, a) { return k(s); },
      onFinish: function(s, k, a) { return k(s); },

      logProgress: false,
      logProgressFilename: 'optimizeProgress.csv',
      logProgressThrottle: 200
    }, 'Optimize');

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
      return _.partial(estimators[name](opts), wpplFn, s, a, state);
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

    // Weight decay.
    var decayWeights = weightDecay.parseOptions(options.weightDecay, options.verbose);

    var onStep = function(i, objective, cont) {
      return applyd(s, function(s, exitFlag) {
        return exitFlag ? finish() : cont();
      }, a, options.onStep, [i, objective], 'callback');
    };

    var finish = function() {
      return options.onFinish(s, function(s) {
        if (options.logProgress) {
          fs.closeSync(logFile);
        }
        return k(s);
      }, a, {history: history});
    };

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
              return params.set(paramsObj, function() {
                return onStep(i, objective, next);
              });

            }, { incremental: true });

          });

        },

        // Loop continuation.
        finish);

  }

  function allZero(tensor) {
    return !tensor.anyreduce();
  }

  function allFinite(tensor) {
    return _.every(tensor.data, isFinite);
  }

  function checkGradients(gradObj) {
    // Emit warning when component of gradient is zero.
    _.each(gradObj, function(grad, name) {
      if (allZero(grad)) {
        logGradWarning(name, 'zero');
      }
      if (!allFinite(grad)) {
        // Catches NaN, ±Infinity.
        logGradWarning(name, 'not finite');
      }
    });
  }

  function logGradWarning(name, problem) {
    util.warn('Gradient for param ' + name + ' is ' + problem + '.', true);
  }

  return {
    Optimize: Optimize
  };

};
