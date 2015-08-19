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
    var options = _.extendOwn({ iterations: 100, kernel: MHKernel }, options);

    // Partially applied to make what follows easier to read.
    var initialize = _.partial(Initialize, s, _, a, wpplFn);

    return initialize(function(s, initialTrace) {
      // console.log('Initialized');
      var query = new Query();
      if (initialTrace.value === env.query) { query.addAll(env.query); }

      var acc = (options.justSample || options.onlyMAP) ?
          new MAPEstimator(options.justSample) :
          new Histogram();

      return runMarkovChain(
          options.iterations, initialTrace, options.kernel, query,
          // For each sample:
          function(value, score) { acc.add(value, score); },
          // Continuation:
          function() { return k(s, acc.toERP()); });
    });
  }

  function SMC(s, k, a, wpplFn, options) {
    var options = _.extendOwn({ numParticles: 100, rejuvSteps: 0, rejuvKernel: MHKernel }, options);

    return ParticleFilterCore(s, function(s, particles) {
      var hist = new Histogram();
      var logAvgW = _.first(particles).logWeight;

      return util.cpsForEach(
          function(particle, i, ps, k) {
            assert(particle.value !== undefined);
            assert(particle.logWeight === logAvgW, 'Expected un-weighted particles.');
            if (options.rejuvSteps === 0) {
              hist.add(particle.value);
            }
            // Final rejuvenation.
            return runMarkovChain(options.rejuvSteps, particle, options.rejuvKernel, null, hist.add.bind(hist), k);
          },
          function() {
            var dist = hist.toERP();
            dist.normalizationConstant = logAvgW;
            return k(s, dist);
          },
          particles);

    }, a, wpplFn, options);
  }

  function runMarkovChain(n, initialTrace, kernel, query, yieldFn, k) {
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
          yieldFn(value, trace.score);
        });
  }

  var Histogram = function() {
    this.hist = {};
  };

  Histogram.prototype.add = function(value) {
    var k = JSON.stringify(value);
    if (this.hist[k] === undefined) {
      this.hist[k] = { prob: 0, val: value };
    }
    this.hist[k].prob += 1;
  };

  Histogram.prototype.toERP = function() {
    return erp.makeMarginalERP(util.logHist(this.hist));
  };

  var MAPEstimator = function(retainSamples) {
    this.MAP = { value: undefined, score: -Infinity };
    this.samples = [];
    this.retainSamples = retainSamples;
  };

  MAPEstimator.prototype.add = function(value, score) {
    if (this.retainSamples) { this.samples.push(value); }
    if (score > this.MAP.score) {
      this.MAP.value = value;
      this.MAP.score = score;
    }
  };

  MAPEstimator.prototype.toERP = function() {
    var hist = new Histogram();
    hist.add(this.MAP.value);
    var erp = hist.toERP();
    if (this.retainSamples) { erp.samples = this.samples; }
    return erp;
  };

  return {
    Infer: Infer,
    MCMC: MCMC,
    SMC: SMC
  };

};
