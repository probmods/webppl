'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var util = require('../util');

module.exports = function(env) {

  function Infer(s, k, a, wpplFn, options) {
    return options.method(s, function(s, val) {
      return k(s, val);
    }, a, wpplFn, options);
  }

  function MCMC(s, k, a, wpplFn, options) {
    // TODO: Set defaults.
    var n = options.iterations;
    var kernel = options.kernel;

    // Partially applied to make what follows easier to read.
    var initialize = _.partial(Initialize, s, _, a, wpplFn);

    return initialize(function(s, initialTrace) {
      // console.log('Initialized');
      var hist = {};
      return runMarkovChain(
          n, initialTrace, kernel, hist,
          function() { return k(s, erp.makeMarginalERP(util.logHist(hist))); });
    });
  }

  function SMC(s, k, a, wpplFn, options) {
    return ParticleFilterCore(s, function(s, particles) {
      var hist = {};
      var logAvgW = _.first(particles).logWeight;

      return util.cpsForEach(
          function(particle, i, ps, k) {
            assert(particle.value !== undefined);
            assert(particle.logWeight === logAvgW, 'Expected un-weighted particles.');
            var r = JSON.stringify(particle.value);
            if (hist[r] === undefined) { hist[r] = { prob: 0, val: particle.value }; }
            hist[r].prob += 1;
            // Final rejuvenation.
            return runMarkovChain(options.rejuvSteps, particle, options.rejuvKernel, hist, k);
          },
          function() {
            var dist = erp.makeMarginalERP(util.logHist(hist));
            dist.normalizationConstant = logAvgW;
            return k(s, dist);
          },
          particles);

    }, a, wpplFn, options);
  }

  function runMarkovChain(n, initialTrace, kernel, hist, k) {
    return util.cpsIterate(
        n, initialTrace, kernel, k,
        function(trace) {
          var r = JSON.stringify(trace.value);
          if (hist[r] === undefined) {
            hist[r] = { prob: 0, val: trace.value };
          }
          hist[r].prob += 1;
        });
  }

  return {
    Infer: Infer,
    MCMC: MCMC,
    SMC: SMC
  };

};
