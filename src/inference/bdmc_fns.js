'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Query = require('../query').Query;
var aggregation = require('../aggregation');

module.exports = function(env){


// function AISRAISE(s, k, a, wpplFn, options) {
//     var options = util.mergeDefaults(options, {
//       steps: [20],
//       samples: 1,
//       mcmcSteps: 20
//     });

//     var observeTable, exactSample;

//     var gaps = []

//     var initialize = function() {
//         return Initialize(s, function(s1, trace, table) {
//           observeTable = table;
//           exactSample = trace;
          
//           return util.cpsLoop(options.steps.length, function(i, next){
//             return singleGap(function(gap){
//               console.log('Loop ' + (i+1) + ' done.');
//               gaps.push(gap); return next()}, i);
//           }, function(){return k(s, gaps)})
//         }, a, wpplFn, {observeMode: 'build'});
//     }

//     var singleGap = function(k, i) {

//       var rais, rais1, ais, finish, raisWeight, aisWeight, rais1Weight;

//       rais = function() {
//         var raisOptions = {steps: options.steps[i],
//                            samples: options.samples,
//                            returnMean: true,
//                            observeTable: observeTable,
//                            exactSample: exactSample};
       
//         // Uses the exact sample for rais.
//         // if (options.samples === 1)
//         //   raisOptions.exactSample = trace;
        
//         return RAIS(s, rais1, a, wpplFn, raisOptions);
//       }

//       rais1 = function(s1, weight) {
//         raisWeight = weight;
//         var raisOptions = {steps: options.steps[i]/100,
//                            bounces: 100,
//                            samples: options.samples,
//                            returnMean: true,
//                            observeTable: observeTable,
//                            exactSample: exactSample};
       
//         // Uses the exact sample for rais.
//         // if (options.samples === 1)
//         //   raisOptions.exactSample = trace;
        
//         return RAIS(s, ais, a, wpplFn, raisOptions);
//       }

//       ais = function(s1, weight) {
//         rais1Weight = weight;

//         var raisOptions = {steps: options.steps[i]/100,
//                            samples: 100,
//                            returnMean: true,
//                            observeTable: observeTable,
//                            exactSample: exactSample};
       
//         // Uses the exact sample for rais.
//         // if (options.samples === 1)
//         //   raisOptions.exactSample = trace;
        
//         return RAIS(s, finish, a, wpplFn, raisOptions);
//       }

//       finish = function(s1, weight) {
//         aisWeight = weight;
//         return k([options.steps[i], aisWeight, raisWeight, rais1Weight]);
//       }
//       return rais();
//     }


// function AR(s, k, a, wpplFn, options) {
//     var options = util.mergeDefaults(options, {
//       steps: [20],
//       samples: 1,
//       mcmcSteps: 20
//     });

//     var gaps = [];

//     var singleGap = function(i, next) {

//       var ais, rais, finish;
//       var aisWeight, raisWeight;

//       ais = function() {
//         var aisOptions = {steps: options.steps[i],
//                           samples: options.samples,
//                           returnMean: true,
//                           observeTable: undefined
//       }

//       return AIS(s, function(s, weight){
//         aisWeight = weight;
//         return rais();
//         }, a, wpplFn, aisOptions);
//       }

//       rais = function() {
//         var raisOptions = {steps: options.steps[i],
//                            samples: options.samples,
//                            mcmcSteps: options.mcmcSteps,
//                            returnMean: true,
//                            observeTable: undefined,
//                            exactSample: undefined}
//         return RAIS(s, function(s, weight){
//           raisWeight = weight;
//           return finish();
//         }, a, wpplFn, raisOptions);
//       }

//       finish = function(){
//         gaps.push([options.steps[i], aisWeight, raisWeight]);
//         console.log((i+1) + '/' + options.steps.length + ' done.');
//         return next();
//       }

//       return ais();
//     }

//     return util.cpsLoop(options.steps.length, singleGap,
//       function(){return k(s, gaps)});
//   }

  

    return initialize();
  }







   return {
    AIS: AIS,
    RAIS: RAIS,
    AISRAISE: AISRAISE,
    AR: AR,
    repeatKernel: repeatKernel,
    sequenceKernels: sequenceKernels
    };
};