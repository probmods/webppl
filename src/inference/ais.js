// This closely follows the AIS implementation developed for WebPPL as
// part of "Measuring the reliability of MCMC inference with
// bidirectional Monte Carlo" (Grosse et al).

// https://arxiv.org/abs/1606.02275
// https://github.com/siddancha/webppl/tree/b607efe714d78c44f763ffd36324c0b67de96f56

'use strict';

var _ = require('lodash');
var assert = require('assert');
var util = require('../util');
var numeric = require('../math/numeric');

module.exports = function(env){

  var Initialize = require('./initialize')(env);
  var kernels = require('./kernels')(env);

  function AIS(s, k, a, wpplFn, options) {
    options = util.mergeDefaults(options, {
      steps: 20,
      samples: 1
    });

    var weights = [];

    var singleSample = function(k) {

      var initialize, run, finish;

      initialize = function() {
        return Initialize(run, wpplFn, s, env.exit, a, {});
      };

      run = function(initialTrace) {

        var curStep = 0;
        var increment = 1 / options.steps;
        var weight = 0;

        var MHKernel = kernels.parseOptions('MH');

        var mhStepKernel = function(k, trace) {
          weight += increment * trace.scoreAllFactors();
          curStep += 1;
          return MHKernel(k, trace, {
            factorCoeff: curStep * increment,
            allowHardFactors: false
          });
        };

        var mhChainKernel = kernels.repeat(options.steps, mhStepKernel);

        return mhChainKernel(function(trace) {
          return k(weight);
        }, initialTrace);
      };

      return initialize();
    };

    return util.cpsLoop(options.samples, function(i, next) {
      return singleSample(function(weight) {
        weights.push(weight);
        return next();
      });
    }, function() {
      var avgWeight = numeric._sum(weights) / options.samples;
      return k(s, avgWeight);
    });
  }

  return {AIS: AIS};

};
