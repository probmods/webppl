'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');

module.exports = function(env) {

  // *** Kernels (trace => trace)

  // TODO: Rename MH.
  // MHKernel :: trace => trace

  // TODO: Implement. (Kernel maker.)
  // Mixture :: [trace => trace] => (trace => trace)


  // *** Initializers ( => trace)

  // Rejection :: => trace
  // PFInit :: => trace


  // *** Other

  // ParticleFilterCore :: => [trace]

  // *** Methods:

  // PF :: => ERP
  // options
  //   { rejuv: trace => trace }

  // MCMC :: => ERP
  // options:
  //   { init: => trace }
  //   { kernel: trace => trace }

  // NOTE: If we use function composition e.g. Mixture(MH, HMC) how do we handle
  // kernels which take options? Partial application?

  // Examples:
  //Infer(program, { method: MCMC, init: Rejection, kernel: MHKernel })
  //Infer(program, { method: MCMC, init: PFInit, kernel: Mixture(MHKernel, HMC) })

  // NOTE: Kernels for rejuvenation need to support early exit.

  //Infer(program, { method: PF, rejuvKernel: MHKernel })
  //Infer(program, { method: PF, rejuvKernel: Mixture(MH, HMC) })

  var Infer = function(s, k, a, wpplFn, options) {
    return options.method(s, function(s, val) {
      return k(s, val);
    }, a, wpplFn, options);
  };

  function MCMC(s, k, a, wpplFn, options) {
    // TODO: Set defaults.
    var n = options.iterations;
    // Partially applied to make what follows easier to read.
    var init = _.partial(options.init, s, _, a, wpplFn);
    var kernel = options.kernel;

    return init(function(s, initialTrace) {
      // console.log('Initialized');
      var hist = {};
      return util.cpsIterate(
          n, initialTrace, kernel,
          function(_) { return k(s, erp.makeMarginalERP(hist)) },
          function(trace) {
            var r = JSON.stringify(trace.value);
            if (hist[r] === undefined) {
              hist[r] = { prob: 0, val: trace.value };
            }
            hist[r].prob += 1;
          });
    });
  };

  var PF = function(s, k, a, wpplFn, options) {
    return ParticleFilterCore(s, function(s, particles) {
      var hist = {};
      var logAvgW = _.first(particles).logWeight;

      particles.forEach(function(p) {
        assert(p.value !== undefined);
        assert(p.logWeight === logAvgW, 'Expected un-weighted particles.');
        var r = JSON.stringify(p.value);
        if (hist[r] === undefined) hist[r] = { prob: 0, val: p.value };
        hist[r].prob += 1;
      });

      var dist = erp.makeMarginalERP(hist);
      dist.normalizationConstant = logAvgW;
      return k(s, dist);

    }, a, wpplFn, options);
  };

  return {
    Infer: Infer,
    MCMC: MCMC,
    PF: PF
  };

};
