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
      observeTable: undefined,
      exactSample: undefined
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

        var beginTime = (new Date()).getTime()

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
          var endTime = (new Date()).getTime();
          var time = (endTime - beginTime)/1000;
          return k([weight, time]);
        }, initialTrace);
      }
      
      if (options.exactSample === undefined)
        return initialize();
      else
        return run(s, options.exactSample);
    }

    return util.cpsLoop(options.samples, function(i, next){
      return singleSample(function(weight){
        weights.push(weight);
        return next();
      })
    }, function(){
      if (options.returnMean) {
        var sum = 0;
        var sum_sq = 0;
        var time_sum = 0
        for (var i = 0; i < weights.length; i ++) {
          var weight = weights[i][0];
          var time = weights[i][1];
          sum += weight;
          sum_sq += weight*weight;
          time_sum += time;
        }
        var mean = sum/options.samples;
        var variance = sum_sq/options.samples - mean*mean;
        return k(s, [mean, Math.sqrt(variance), time_sum/options.samples]);
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
      exactSample: undefined
    });

    assert(options.exactSample !== undefined);

    var weights = [];

    // To be used with util.cpsLoop
    var singleSample = function (k) {

      var run;

      run = function(initialTrace) {

        var factorCoeff = 1;
        var step = 1/options.steps;
        var weight = 0;

        var beginTime = (new Date()).getTime();

        var mhKernel = function(k, trace) {
          weight -= step*(trace.score-trace.sampleScore);
          factorCoeff -= step;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, observeTable: options.observeTable});
        }

        var mhChainKernel = repeatKernel(options.steps, mhKernel);

        return mhChainKernel(function(trace){
          var endTime = (new Date()).getTime();
          var time = (endTime - beginTime)/1000;
          return k([-1.0*weight, time]);
          // return k([singleWeights[singleWeights.length-1]]);
        }, initialTrace);
      }
    
      return run(options.exactSample);
    }

    return util.cpsLoop(options.samples, function(i, next){
      return singleSample(function(weight){
        // Array.prototype.push.apply(weights, singleWeights);
        weights.push(weight);
        return next();
      })
    }, function(){
      if (options.returnMean) {
        var sum = 0;
        var sum_sq = 0;
        var time_sum = 0;
        for (var i = 0; i < weights.length; i++) {
          var weight = weights[i][0];
          var time = weights[i][1];
          sum += weight;
          sum_sq += weight*weight;
          time_sum += time;
        }
        var mean = sum/weights.length;
        var variance = sum_sq/weights.length - mean*mean;
        return k(s, [mean, Math.sqrt(variance), time_sum/weights.length]);
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

    var initialize, priorInitialize, postInitialize, observeTable;
    var priorSample, postSample;

    var gaps = [];

    postInitialize = function(k) {
      return Initialize(s, function(s, trace, table) {
        observeTable = table;
        postSample = trace;
        return k();
      }, a, wpplFn, {observeMode: 'build'})
    }

    priorInitialize = function(k) {
      return Initialize(s, function(s, trace){
        priorSample = trace;
        return k();
      }, a, wpplFn, {observeMode: 'use', observeTable: observeTable})
    }

    initialize = function(k) {
      return postInitialize(function(){
        return priorInitialize(k);
      })
    }

    var singleBDMC = function(k, steps, samples) {
      
      var aisWeight, raisWeight;
      var ais, rais, finish;

      ais = function() {
        var aisOptions = {
          steps: steps,
          samples: samples,
          returnMean: true,
          observeTable: observeTable,
          exactSample: priorSample
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
          exactSample: postSample
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
          gaps.push([aisWeight[0], aisWeight[1], aisWeight[2], raisWeight[0], raisWeight[1], raisWeight[2]]);
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