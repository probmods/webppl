'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Query = require('../query').Query;
var aggregation = require('../aggregation');

module.exports = function(env){

  function AIS (s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: 20,
      samples: 10,
      returnMean: true,
      observeTable: undefined
    });

    var weights = [];

    // To be used with util.cpsLoop
    var singleSample = function (k) {

      var initialize, run, finish;

      initialize = function() {
        if (options.observeTable !== undefined)
          return Initialize(s, run, a, wpplFn,
            {observeMode: 'use', observeTable: options.observeTable});
        else
          return Initialize(s, run, a, wpplFn, {observeMode: 'none'});
      };

      run = function(s, initialTrace) {

        var factorCoeff = 0;
        var increment = 1/options.steps;
        var weight = 0;

        var mhStepKernel = function(k, trace) {
          weight += increment*(trace.score-trace.sampleScore);
          factorCoeff += increment;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, observeTable: options.observeTable});  
        }

        var mhChainKernel = repeatKernel(options.steps, mhStepKernel);

        return mhChainKernel(function(trace){
          return k(Math.exp(weight));
        }, initialTrace);
      }
    
      return initialize();
    }

    return util.cpsLoop(options.samples, function(i, next){
      return singleSample(function(weight){
        weights.push(weight);
        return next();
      })
    }, function(){
      if (options.returnMean) {
        var sum = _.reduce(weights, function(a, b){return a+b;});
        return k(s, sum/options.samples);
      } else {
        return k(s, weights);
      }
    });
  };


  function RAIS (s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: 20,
      samples: 10,
      returnMean: true,
      observeTable: undefined,
      mcmcSteps: 20,
      exactSample: undefined
    });

    var weights = [];

    // To be used with util.cpsLoop
    var singleSample = function (k) {

      var mcmc, run;

      // Code mostly copied from mcmc.js.
      var mcmc = function() {

        var mcmcInitialize, mcmcRun;

        mcmcInitialize = function() {
          if (options.observeTable !== undefined)
            return Initialize(s, mcmcRun, a, wpplFn,
              {observeMode: 'use', observeTable: options.observeTable});
          else
            return Initialize(s, mcmcRun, a, wpplFn, {observeMode: 'none'});  
          };

          mcmcRun = function(s, initialTrace) {
          var kernel = function(k, trace) {
            return MHKernel(k, trace, {observeTable: options.observeTable});
          }
          var chain = repeatKernel(options.mcmcSteps, kernel);
          return chain(run, initialTrace);
        };

        return mcmcInitialize();
      }


      run = function(initialTrace) {

        var factorCoeff = 1;
        var decrement = 1/options.steps;
        var weight = 0;

        var mhStepKernel = function(k, trace) {

          weight -= decrement*(trace.score-trace.sampleScore);
          factorCoeff -= decrement;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, observeTable: options.observeTable});  
        }

        var mhChainKernel = repeatKernel(options.steps, mhStepKernel);

        return mhChainKernel(function(trace){
          return k(Math.exp(-1*weight));
        }, initialTrace);
      }
    
      if (options.exactSample === undefined)
        return mcmc();
      else
        return run(options.exactSample);
    }

    return util.cpsLoop(options.samples, function(i, next){
      return singleSample(function(weight){
        weights.push(weight);
        return next();
      })
    }, function(){
      if (options.returnMean) {
        var sum = 0;
        for (var i = 0; i < weights.length; i++)
          sum += 1/weights[i];
        return k(s, options.samples/sum);
      } else {
        return k(s, weights);
      }
    });
  };

  function AISRAISE(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: 20,
      samples: 1,
      mcmcSteps: 20
    });

    var observeTable, aisWeight, raisWeight;

    var initialize, rais, ais, finish;

    initialize = function() {
      return Initialize(s, function(s1, trace, table) {
        observeTable = table;
        return rais(trace);
      }, a, wpplFn, {observeMode: 'build'});
    }

    rais = function(trace) {
      var raisOptions = {steps: options.steps,
                         samples: options.samples,
                         returnMean: true,
                         observeTable: observeTable,
                         mcmcSteps: options.mcmcSteps};
     
      // Uses the exact sample for rais.
      if (options.samples === 1)
        raisOptions.exactSample = trace;
      
      return RAIS(s, ais, a, wpplFn, raisOptions);
    }

    ais = function(s1, weight) {
      raisWeight = weight;

      var aisOptions = {steps: options.steps,
                        samples: options.samples,
                        returnMean: true,
                        observeTable: observeTable};
      return AIS(s, finish, a, wpplFn, aisOptions);
    }

    finish = function(s1, weight) {
      aisWeight = weight;
      return k(s, [aisWeight, raisWeight]);
    }

    return initialize();
  }

  function sequenceKernels() {
    var kernels = arguments;
    assert(kernels.length > 1);
    if (kernels.length === 2) {
      return function(k, trace1) {
        return kernels[0](function(trace2) {
          return kernels[1](k, trace2);
        }, trace1);
      };
    } else {
      return sequenceKernels(
          kernels[0],
          sequenceKernels.apply(null, _.rest(kernels)))
    }
  }

  function repeatKernel(n, kernel) {
    return function(k, trace) {
      return util.cpsIterate(n, trace, kernel, k);
    };
  }

  return {
    AIS: AIS,
    RAIS: RAIS,
    AISRAISE: AISRAISE,
    repeatKernel: repeatKernel,
    sequenceKernels: sequenceKernels
    };
};