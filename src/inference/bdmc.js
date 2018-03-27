'use strict';

var _ = require('underscore');
var assert = require('assert');
var fs = require('fs');
var util = require('../util');
var Query = require('../query').Query;

module.exports = function(env){

  var Initialize = require('./initialize')(env);
  var kernels = require('./kernels')(env);

  function AIS (s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: 20,
      samples: 1,
      returnMean: true,
      initSampleMode: 'none',
      initObserveMode: 'none',
      cacheTable: undefined,
    });

    var weights = [];

    // To be used with util.cpsLoop
    var singleSample = function (k) {

      var initialize, run, finish;

      initialize = function() {
        return Initialize(run, wpplFn, s, env.exit, a,
          {initObserveMode: options.initObserveMode,
            initSampleMode: options.initSampleMode,
            cacheTable: options.cacheTable});
      };

      run = function(initialTrace) {

        var beginTime = (new Date()).getTime()

        var factorCoeff = 0;
        var increment = 1/options.steps;
        var weight = 0;

        var MHKernel = kernels.parseOptions('MH');

        var mhStepKernel = function(k, trace) {
          weight += increment*(trace.score-trace.sampleScore);
          factorCoeff += increment;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, cacheTable: options.cacheTable});  
        }

        var mhChainKernel = repeatKernel(options.steps, mhStepKernel);

        return mhChainKernel(function(trace){
          var endTime = (new Date()).getTime();
          var time = (endTime - beginTime)/1000;
          return k([weight, time]);
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
  }


  function RAIS (s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: 20,
      samples: 10,
      returnMean: true,
      initSampleMode: 'none',
      initObserveMode: 'none',
      cacheTable: undefined,
    });

    assert(options.cacheTable !== undefined);

    var weights = [];

    // To be used with util.cpsLoop
    var singleSample = function (k) {

      var initialize, run;

      var MHKernel = kernels.parseOptions('MH');

      initialize = function() {
        return Initialize(run, wpplFn, s, env.exit, a,
          {initObserveMode: options.initObserveMode,
            initSampleMode: options.initSampleMode,
            cacheTable: options.cacheTable});
      };

      run = function(initialTrace) {

        var factorCoeff = 1;
        var step = 1/options.steps;
        var weight = 0;

        var beginTime = (new Date()).getTime();

        var mhKernel = function(k, trace) {
          weight -= step*(trace.score-trace.sampleScore);
          factorCoeff -= step;
          return MHKernel(k, trace,
            {factorCoeff: factorCoeff, cacheTable: options.cacheTable});
        }

        var mhChainKernel = repeatKernel(options.steps, mhKernel);

        return mhChainKernel(function(trace){
          var endTime = (new Date()).getTime();
          var time = (endTime - beginTime)/1000;
          return k([-1.0*weight, time]);
          // return k([singleWeights[singleWeights.length-1]]);
        }, initialTrace);
      }
    
      return initialize();
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
  }

  function BDMC(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      steps: [20],
      samples: 1,
      loadExactSamplePath: undefined,
      saveExactSamplePath: undefined,
    });

    var priorCacheTable, posteriorCacheTable;
    var gaps = [];

    var posteriorInitialize = function(k) {
      return Initialize(function(trace, table) {
        posteriorCacheTable = table;
        return k();
      }, wpplFn, s, env.exit, a, {initSampleMode: 'build', initObserveMode: 'build'})
    }

    var priorInitialize = function(k) {
      return Initialize(function(trace, table) {
        priorCacheTable = table;
        return k();
      }, wpplFn, s, env.exit, a, {initSampleMode: 'build', initObserveMode: 'use',
        cacheTable: _.clone(posteriorCacheTable)})
    }

    var initialize = function(k) {
      if (options.loadExactSamplePath !== undefined) {
        var objString = String(fs.readFileSync(options.loadExactSamplePath));
        var tables = JSON.parse(objString);
        priorCacheTable = tables[0];
        posteriorCacheTable = tables[1];
        return k();
      }
      return posteriorInitialize(function(){
        return priorInitialize(function(){
          if (options.saveExactSamplePath !== undefined) {
            var objString = JSON.stringify([priorCacheTable, posteriorCacheTable]);
            fs.writeFile(options.saveExactSamplePath, objString);
          }
          return k();
        })
      })
    }

    var singleBDMC = function(k, steps, samples) {
      
      var aisWeight, raisWeight;
      var ais, rais, finish;

      ais = function() {
        var aisOptions = {
          steps: steps,
          samples: samples,
          returnMean: false,
          initSampleMode: 'use',
          initObserveMode: 'use',
          cacheTable: priorCacheTable
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
          returnMean: false,
          initSampleMode: 'use',
          initObserveMode: 'use',
          cacheTable: posteriorCacheTable,
          mcmcSteps: -1
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
          gaps.push([JSON.stringify(aisWeight), JSON.stringify(raisWeight)]);
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
