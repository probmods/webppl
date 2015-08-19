'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var util = require('../util');
var Query = require('../query.js').Query;

module.exports = function(env) {

  function Infer(s, k, a, wpplFn, options) {
    var baseArgs = [s, k, a, wpplFn];
    return options.method.apply(null, baseArgs.concat(methodArgs(options)));
  }

  function methodArgs(options) {
    // Maps an options object to a list of arguments. Used to present a uniform
    // interface over existing inference methods.
    // TODO: Clean this up:
    // 1. This could be removed if we don't care about backwards compat.
    // 2. Push these down into the inference methods.
    //    a. Attach a function to do this conversion to the inference function. Ergh.
    //    b. Export a conversion function alongside the inference function.
    //    c. Update each inference routine to take an options hash *or* the old
    //       style args list.
    switch (options.method) {
      case Enumerate:
      case EnumerateDepthFirst:
      case EnumerateBreadthFirst:
        return [options.maxExecutions];
      default:
        return options;
    }
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
      var query = new Query();
      if (initialTrace.value === env.query) { query.addAll(env.query); }
      return runMarkovChain(
          n, initialTrace, kernel, hist, query,
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
            if (options.rejuvSteps === 0) {
              var r = JSON.stringify(particle.value);
              if (hist[r] === undefined) { hist[r] = { prob: 0, val: particle.value }; }
              hist[r].prob += 1;
            }
            // Final rejuvenation.
            return runMarkovChain(options.rejuvSteps, particle, options.rejuvKernel, hist, null, k);
          },
          function() {
            var dist = erp.makeMarginalERP(util.logHist(hist));
            dist.normalizationConstant = logAvgW;
            return k(s, dist);
          },
          particles);

    }, a, wpplFn, options);
  }

  function runMarkovChain(n, initialTrace, kernel, hist, query, k) {
    return util.cpsIterate(
        n, initialTrace, kernel, k,
        function(i, trace, accepted) {
          var value;
          if (query && trace.value === env.query) {
            if (accepted) { query.addAll(env.query); }
            value = query.getTable();
          } else {
            value = trace.value;
          }

          var r = JSON.stringify(value);
          if (hist[r] === undefined) {
            hist[r] = { prob: 0, val: value };
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
