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
      samples: 1,
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
          return k(weight);
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
        var sum = 0;
        for (var i = 0; i < weights.length; i ++)
          sum += weights[i];
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
      bounces: 0,
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
        var step = 1/options.steps;
        var weight = 0;
        var singleWeights = [];

        var reverseKernel = function(k, trace) {
          weight -= step*(trace.score-trace.sampleScore);
          factorCoeff -= step;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, observeTable: options.observeTable});
        }

        var reverseChainKernelUnupdated = repeatKernel(options.steps, reverseKernel);

        // Initial factorCoeff should be 1.
        var reverseChainKernel = function(k, trace) {
          return reverseChainKernelUnupdated(function(trace1){
            singleWeights.push(-1.0*weight);
            return k(trace1);
          }, trace);
        }

        var forwardKernel = function(k, trace) {
          weight += step*(trace.score-trace.sampleScore);
          factorCoeff += step;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, observeTable: options.observeTable});
        }

        // Initial factorCoeff should be 0.
        var forwardChainKernel = repeatKernel(options.steps, forwardKernel);

        var bounceChainKernel = repeatKernel(options.bounces,
          sequenceKernels(forwardChainKernel, reverseChainKernel));

        var mhChainKernel = sequenceKernels(reverseChainKernel, bounceChainKernel);

        return mhChainKernel(function(trace){
          return k(singleWeights);
          // return k([singleWeights[singleWeights.length-1]]);
        }, initialTrace);
      }
    
      if (options.exactSample === undefined)
        return mcmc();
      else
        return run(options.exactSample);
    }

    return util.cpsLoop(options.samples, function(i, next){
      return singleSample(function(singleWeights){
        Array.prototype.push.apply(weights, singleWeights);
        return next();
      })
    }, function(){
      if (options.returnMean) {
        var sum = 0;
        for (var i = 0; i < weights.length; i++)
          sum += weights[i];
        return k(s, sum/weights.length);
        // var sum = util.logsumexp(weights);
        // return k(s, weights.length/Math.exp(sum));
      } else {
        return k(s, weights);
      }
    });
  };

  function BDMC(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: [20],
      samples: 1,
    });

    var initialize, observeTable, exactSample;
    var gaps = [];

    initialize = function(k) {
      return Initialize(s, function(s, trace, table) {
        observeTable = table;
        exactSample = trace;
        return k();
      }, a, wpplFn, {observeMode: 'build'})
    }

    var singleBDMC = function(k, steps, samples) {
      
      var aisWeight, raisWeight;
      var ais, rais, finish;

      ais = function() {
        var aisOptions = {
          steps: steps,
          samples: samples,
          returnMean: true,
          observeTable: observeTable
        }
        
        return AIS(s, function(s, weight) {
          aisWeight = weight;
          return rais();
        }, a, wpplFn, aisOptions)
      }

      rais = function() {
        var raisOptions = {
          steps: steps,
          samples: samples,
          bounces: 0,
          returnMean: true,
          observeTable: observeTable,
          mcmcSteps: -1,
          exactSample: exactSample
        }

        return RAIS(s, function(s, weight){
          raisWeight = weight;
          return finish();
        }, a, wpplFn, raisOptions);
      }

      finish = function() {
        return k(aisWeight, raisWeight);
      }

      return ais();
    }

    return initialize(function(){
      return util.cpsLoop(options.steps.length, function(i, next){
        return singleBDMC(function(aisWeight, raisWeight){
          gaps.push([aisWeight, raisWeight]);
          console.log((i+1) + '/' + options.steps.length + ' done ...');
          return next();
        }, options.steps[i], options.samples);
      }, function(){
        return k(s, gaps);
      })
    })
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
    BDMC: BDMC,
    repeatKernel: repeatKernel,
    sequenceKernels: sequenceKernels
    };
};