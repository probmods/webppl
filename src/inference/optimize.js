// Optimizes the parameters of a guide program.

// Takes a wpplFn representing the target and guide and optionally the
// current parameters and returns optimized parameters. (The
// parameters passed in are not modified.)

// If initial parameters are not given, the parameters are initialized
// lazily as specified by the guide.

'use strict';

var assert = require('assert');
var _ = require('underscore');
var nodeutil = require('util');
var present = require('present');
var util = require('../util');
var optMethods = require('adnn/opt');
var paramStruct = require('../paramStruct');
var fs = require('fs');
var nodeUtil = require('util');

module.exports = function(env) {

  var estimators = {
    ELBO: require('./elbo')(env),
    EUBO: require('./eubo')(env),
    DREAM: require('./dreamEubo')(env),
    SDREAM: require('./dream')(env)
  };

  var stopCriterionType = {
    MAX_ITERATIONS: 0,
    ABSOLUTE_OBJECTIVE_TOLERANCE: 1, // so-so
    RELATIVE_OBJECTIVE_TOLERANCE: 2, // so-so
    ABOSULTE_GRADNORM_TOLERANCE: 3, // useful
    RELATIVE_GRADNORM_TOLERANCE: 4 // useful
    // TODO: add early stopping criterion - should be the the most reliable for SGD
    // TODO: add an option for a user-defined function for an arbitrary stopping criterion
  };

  // TODO: add max/min only among last iterations or among all?
  var returnedParamsType = {
    LAST: 0,
    MAX: 1, // ELBO (Lower bound)
    MIN: 2 // EUBO (Upper bound)
    // TODO: will be good only after we are around the convergence point.
    // Should take max/min among last iterations + should compare diff to average diff rather than previous
    // TODO: add average  - there's a theoretical basis that averaging params during sgd can be a good idea.
    // TODO: add an option for a user-defined function that chooses the returned param based on any other criterion
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
      params: {},
      optMethod: 'adam',
      estimator: 'ELBO',
      steps: 100, // TODO: change to maxSteps?
      minSteps: 100,
      clip: false,              // false = no clipping, otherwise specifies threshold.
      showGradNorm: false,
      checkGradients: true,
      verbose: true,
      stopCriterion: stopCriterionType.MAX_ITERATIONS,
      toleranceThreshold: [-1, 0.000001, 0.000001, 0.0001, 0.0001], // TODO: refactor?
      returedParamConfig: returnedParamsType.LAST,
      onFinish: function(s, k, a) { return k(s); },

      logProgress: false,
      logProgressFilename: 'optimizeProgress.csv',
      logProgressThin: 1, // TODO change name to iterationThinning
      logProgressThrottle: 0, // TODO change name to TimeThinning

      checkpointParams: false,
      checkpointParamsFilename: 'optimizeParams.json',
      //checkpointParamsThin: 1, // TODO: support that?
      checkpointParamsThrottle: 0,
      keepParamsHistory: true
    });

    options.toleranceThreshold = options.toleranceThreshold[options.stopCriterion]; //TODO: refactor

    // Create a (cps) function 'estimator' which takes parameters to
    // gradient estimates. Every application of the estimator function
    // is passed the 'state' variable. This allows an estimator to
    // maintain state between calls by modifying the contents of this
    // object.
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

    // TODO: average over number of iterations and stop only if average is low enough
    // or compare current iteration to average of last iterations
    // TODO: move to a different module
    var objPrev = NaN, objDiff = NaN, objPrevDiff = NaN, objRelDiff = NaN;
    var normRel = NaN; //normDiff = NaN, normPrevDiff = NaN, normPrev = NaN,
    var stop = function(obj, gradNorm, paramNorm, i) {
      if (!options.stopCriterion) {
        return false;
      }

      objDiff = i ? obj - objPrev : NaN;
      //normDiff = progressNcalls ? gradNorm - normPrev : NaN;
      objRelDiff = (!isNaN(objPrev)) ? objDiff / objPrev : NaN;
      normRel = gradNorm / paramNorm; //normPrevDiff ? gradNorm / paramNorm : NaN;
      var diffs = [i, objDiff, objRelDiff, gradNorm, normRel];

      var ret = Math.abs(diffs[options.stopCriterion]) < options.toleranceThreshold;

      objPrev = obj;
      objPrevDiff = objDiff;
      //normPrev = gradNorm;
      //normPrevDiff = normDiffLog;

      return ret;
    }

    var paramObj = paramStruct.deepCopy(options.params);

    var returnedConfig = {
      objective: [null, -Infinity, Infinity][options.returedParamConfig],
      paramObj: null,
      paramNorm: NaN,
      i: NaN
    };

    var copyCnfig = function(i, objective, paramObj, paramNorm) {
      returnedConfig.objective = objective;
      //returnedConfig.paramObj = paramObj; TODO: understand why deep copy is needed
      returnedConfig.paramObj = paramStruct.deepCopy(paramObj);
      returnedConfig.paramNorm = paramNorm;
      returnedConfig.i = i;
    }

    // TODO: refactor - it currently depends on the index -
    // a dictionary that has each method full config would be better
    // TODO: move params as a struct instead of argument list
    // TODO: add a function of predicate for each config
    var recordBest = function(i, objective, paramObj, paramNorm) {
      switch (options.returedParamConfig) { // TODO: this will work only if there are no additional options
        case returnedParamsType.LAST:
          copyCnfig(i, objective, paramObj, paramNorm);
          break;
        case returnedParamsType.MAX:
          if (objective > returnedConfig.objective) {
            copyCnfig(i, objective, paramObj, paramNorm);
          }
          break;
        case returnedParamsType.MIN:
          if (objective < returnedConfig.objective) {
            copyCnfig(i, objective, paramObj, paramNorm);
          }
          break;
      }
    }


    var showProgress = _.throttle(function(i, objective) {
      console.log('Iteration ' + i + ': ' + objective);
    }, 200, { trailing: false });

    var history = [];

    // For writing progress to disk
    // TODO: eliminate duplication of logging code
    // TODO: move logging information as an object rather than list of params
    // TODO: create a small module to compute and track statistics for either objective or norm
    var logFile, logProgress;
    if (options.logProgress) {
      logFile = fs.openSync(options.logProgressFilename, 'w');
      fs.writeSync(logFile, 'index,iter,time,objective,absoulteDiff,relativeDiff,gradientNorm,normRellDiff\n');

      var progressNcalls = 0;
      var starttime = present();
      var objPrevLog = NaN, objDiffLog = NaN, objPrevDiffLog = NaN, objRelDiffLog = NaN;
      var normRelLog = NaN; //normDiffLog = NaN, normPrevDiffLog = NaN, normPrevLog = NaN,

      var logProgressFunc = function(i, obj, gradNorm, paramNorm) {
        if (i % options.logProgressThin) return;
        var t = (present() - starttime) / 1000;

        objDiffLog = progressNcalls ? obj - objPrevLog : NaN;
        //normDiffLog = progressNcalls ? gradNorm - normPrevLog : NaN;
        objRelDiffLog = (!isNaN(objPrevLog)) ? objDiffLog / objPrevLog : NaN; //objPrevDiffLog
        normRelLog = gradNorm / paramNorm; //normPrevLog?

        fs.writeSync(logFile, nodeUtil.format('%d,%d,%d,%d,%d,%d,%d,%d\n',
            progressNcalls, i, t, obj, objDiffLog, objRelDiffLog, gradNorm, normRelLog));
        progressNcalls++;

        objPrevLog = obj;
        objPrevDiffLog = objDiffLog;
        //normPrevLog = gradNorm;
        //normPrevDiffLog = normDiffLog;
      }
      logProgress = options.logProgressThrottle ?
          _.throttle(logProgressFunc, options.logProgressThrottle, { trailing: false }) : logProgressFunc;
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
        // Turn tensor data into regular Array before serialization
        // I think this is faster than using a custom 'replacer' with JSON.stringify?
        var prms = _.mapObject(paramObj, function(lst) {
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
      };
      checkpointParams = options.logProgressThrottle ?
          _.throttle(saveParams, options.checkpointParamsThrottle, { trailing: false }) : saveParams;
    }

    // Main loop.
    return util.cpsLoop(
        options.steps,

        // Loop body.
        function(i, next, cont) {
          return estimator(paramObj, i, function(gradObj, objective) {
            if (options.checkGradients) {
              checkGradients(gradObj);
            }

            var gradNorm, paramNorm;
            if (options.clip || options.showGradNorm || options.logProgress || options.stopCriterion) {
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
            //if (options.returedParamConfig) {
            recordBest(i, objective, paramObj, paramNorm);
            //}

            history.push(objective);
            optimizer(gradObj, paramObj, i);
            if (stop(objective, gradNorm, paramNorm, i)) {
              return cont();
            }
            return next();
          });

        },

        // Loop continuation.
        function() {
          return options.onFinish(s, function(s) {
            if (options.logProgress) {
              fs.closeSync(logFile);
            }
            paramObj = paramStruct.deepCopy(returnedConfig.paramObj);
            if (options.checkpointParams) {
              // Save final params
              saveParams();
              if (options.keepParamsHistory) {
                fs.closeSync(paramsFile);
              }
            }
            if (options.verbose) {
              console.log(returnedConfig);
            }
            return k(s, paramObj);
          }, a, {history: history});
        });

  }

  function allZero(tensor) {
    return !tensor.anyreduce();
  }

  function allFinite(tensor) {
    return _.all(tensor.data, isFinite);
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
