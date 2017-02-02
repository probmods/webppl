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
var fs = require('fs');
var nodeUtil = require('util');

module.exports = function(env) {

  var estimators = {
    ELBO: require('./elbo')(env),
    EUBO: require('./eubo')(env),
    DREAM: require('./dreamEubo')(env),
    SDREAM: require('./dream')(env)
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
      steps: 100, 
      minSteps: 300,
      clip: false,              
      showGradNorm: false,
      checkGradients: true,
      verbose: true,
      //stopCriterion: 'MAX_ITERATIONS',
      toleranceThreshold: [-1, 0.000001, 0.01, 0.001, 0.0001, 0.01, 0.01],
      
      onFinish: function(s, k, a) { return k(s); },
      stopCriterionCallback: function(val) { return true; },

      logProgress: true,
      logProgressFilename: 'optimizeProgress.csv',
      logProgressThin: 1, 
      logProgressThrottle: 0, 

      checkpointParams: false,
      checkpointParamsFilename: 'optimizeParams.json',
      checkpointParamsThrottle: 50,
      keepParamsHistory: true,
      logPosteriorProgress: true,
      logPosteriorFilenamePrefix: 'optimizePosterior',
      logPosteriorFilenameThrottle: 500,

      history: [],
    });

    var saveAverage = false;

    //options.stopCriterion = stopCriterionType[options.stopCriterion];
    //options.toleranceThreshold = options.toleranceThreshold[options.stopCriterion]; //TODO: refactor

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

    var objDiff = NaN, objRelDiff = NaN, avgDiff = NaN, avgRelDiff = NaN; 
    var normRel = NaN; 
    var counter = 0;
    var stop = function(obj, gradNorm, paramNorm, i) {
      // var maxCount = 150;
      // if (!options.stopCriterion) {
        return false;
      // }

      // objDiff = i ? obj - options.average.mean : NaN;
      // objRelDiff = (!isNaN(options.average.mean)) ? objDiff / Math.abs(options.average.mean) : NaN;
      // avgDiff = i ? options.average.mean - options.averageSlow.mean : NaN;
      // avgRelDiff = (!isNaN(options.averageSlow.mean)) ? avgDiff / Math.abs(options.averageSlow.mean) : NaN;
      // normRel = gradNorm / paramNorm;
      // var diffs = [i, objDiff, objRelDiff, gradNorm, normRel, avgDiff, avgRelDiff];
      // var ret = (Math.abs(diffs[options.stopCriterion]) < options.toleranceThreshold) &&
      //           options.stopCriterionCallback(diffs[options.stopCriterion]);
      // if (ret) { 
      //   console.log(counter);
      // }
      // if (i < options.minSteps) {
      //   return false;
      // }
      // if (ret) {
      //   counter++;
      // }
      // return (counter > maxCount);
    }

    var paramObj;

    var computeObjectiveAvgAndVar = function(i, objective) {
      if (!i) {
        options.average.mean = objective; 
        options.average.variance = 0;
      
      }
      var diff = objective - options.average.mean;
      var incr = (1 - options.average.alpha) * diff;
      options.average.mean += incr; 
      options.average.variance = options.average.alpha * (options.average.variance + diff * incr);     
    }

    var showProgress = _.throttle(function(i, objective) {
      console.log('Iteration ' + i + ': ' + objective); //  + ": " + options.average.objective
    }, 150, { trailing: false });

    //var history = [];

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
    var paramsFile, saveParams, checkpointParams;
    if (options.checkpointParams) {
      var paramsFileLength = 0;
      var paramsNcalls = 0;

      if (options.keepParamsHistory) {
        // Open file and write JSON array
        paramsFile = fs.openSync(options.checkpointParamsFilename, 'w');
        paramsFileLength += fs.writeSync(paramsFile, '[]');
      }

      saveParams = function() {
        //params.save(options.checkpointParamsFilename); TODO
        // Turn tensor data into regular Array before serialization
        // I think this is faster than using a custom 'replacer' with JSON.stringify?
        var prms = _.mapObject(saveAverage ? options.average.paramObj : paramObj, function(lst) {
          return lst.map(function(tensor) {
            var tcopy = _.clone(tensor);
            tcopy.data = tensor.toFlatArray();
            return tcopy;
          });
        });

        if (options.keepParamsHistory) {
          // All param objects except the first need ',' prefix to be concatenated correctly to the JSON array
          var sep = paramsNcalls ? ',\n' : '';
          // Ignore last character ']' so that we overwrite it to append the new param object
          paramsFileLength--;
          paramsFileLength += fs.writeSync(paramsFile, sep + JSON.stringify(prms) + ']', paramsFileLength);
        }
        else {
          // Overwrite previous params with new ones
          paramsFileLength = fs.writeFileSync(options.checkpointParamsFilename, JSON.stringify(prms));
        }
        paramsNcalls++;
      }.bind(this);
      checkpointParams = options.checkpointParamsThrottle ?
          _.throttle(saveParams, options.checkpointParamsThrottle, { trailing: false }) : saveParams;
    }

    var logPosteriorProgress, savePosterior;
    if (options.logPosteriorProgress) {
      var posteriorNcalls = 0;
      savePosterior = function() {
        options.paramHistory.push({i: posteriorNcalls, params: paramStruct.deepCopy(paramObj)});
        posteriorNcalls++;
      };

      logPosteriorProgress = function(i) {if (!(i % 250)) savePosterior(); }

      //logPosteriorProgress = options.logPosteriorFilenameThrottle ? 
      //  _.throttle(savePosterior, options.logPosteriorFilenameThrottle, { trailing: false }) : savePosterior;
    }

    var iterations, gradNorm, paramNorm, globalObjective;
    // Main loop.
    var finalize = function() {
      return options.onFinish(s, function(s) {
        if (options.logProgress) {
          fs.closeSync(logFile);
        }
        if (options.checkpointParams) {
          // Save final params
          saveParams();
          saveAverage = true;
          saveParams();
          if (options.keepParamsHistory) {
            fs.closeSync(paramsFile);
          }
        }
        if (options.logPosteriorProgress) {
          savePosterior();
        }
        if (options.verbose) {
          //console.log(returnedConfig);
        }
        return k(s);
      }, a, {history: options.history});
    }.bind(this);

    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next, cont) {
          //debugger;
          iterations = i;
          return estimator(i, function(gradObj, objective) {
            globalObjective = objective;
            var currentIter = function(paramObj) {
              //debugger;
              if (options.checkGradients) {
                checkGradients(gradObj);
              }

              if (options.clip || options.showGradNorm || options.logProgress) { // || options.stopCriterion
                gradNorm = paramStruct.norm(gradObj);
                paramNorm = paramStruct.norm(paramObj);
                if (options.showGradNorm) {
                  console.log('L2 norm of gradient: ' + gradNorm);
                }
                if (options.clip) {
                  paramStruct.clip(gradObj, options.clip, gradNorm);
                }
              }

              if (options.verbose) {
                showProgress(i, objective);
              }
              if (options.logProgress) {
                logProgress(i, objective, gradNorm, paramNorm);
              }
              if (options.checkpointParams) {
                checkpointParams();
              }
              if (options.logPosteriorProgress) {
                logPosteriorProgress(i);
              }

              optimizer(gradObj, paramObj, i);

            }.bind(this);
            
            var nextOrCont = function() {
              if (isNaN(objective) || objective === Infinity || objective === -Infinity ) { //|| stop(objective, gradNorm, paramNorm, i) || t > 2000
                return cont();
              }
              return next();
            }.bind(this);

            // Retrieve latest params from store
            return params.sync(function(paramsObj) {

              paramObj = paramsObj;

              currentIter(paramObj);
              // Update local copy of params
              // optimizer(gradObj, paramsObj, i);

              // Send updated params to store
              return params.set(paramsObj, nextOrCont);

            }.bind(this), { incremental: true });
          }, finalize);

        },

        // Loop continuation.
        finalize);

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
