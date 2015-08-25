'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Query = require('../query.js').Query;
var Histogram = require('../histogram');

module.exports = function(env) {

  function MCMC(s, k, a, wpplFn, options) {
    var options = _.defaults(_.clone(options), { samples: 100, kernel: MHKernel, lag: 1, burn: 0 });

    // TODO: Implement via hooks/callbacks.
    var log = function(s) { if (options.verbose) { console.log(s); } };

    // Partially applied to make what follows easier to read.
    var initialize = _.partial(Initialize, s, _, a, wpplFn);

    return initialize(function(s, initialTrace) {
      var query = new Query();
      if (initialTrace.value === env.query) { query.addAll(env.query); }

      var acceptedCount = 0;
      var acc = (options.justSample || options.onlyMAP) ?
          new MAPEstimator(options.justSample) :
          new Histogram();
      var iterations = options.samples * options.lag + options.burn;

      return runMarkovChain(
          iterations, initialTrace, options.kernel, query,
          // For each sample:
          function(value, score, accepted, iter) {
            if ((iter >= options.burn) &&
                (iter - options.burn + 1) % options.lag === 0) {
              acc.add(value, score);
            }
            log('Iteration ' + (iter + 1) + ' / ' + iterations);
            acceptedCount += accepted;
          },
          // Continuation:
          function() {
            log('Acceptance ratio: ' + acceptedCount / iterations);
            return k(s, acc.toERP());
          });
    });
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
          yieldFn(value, trace.score, accepted, i);
        });
  }

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
    MCMC: MCMC,
    runMarkovChain: runMarkovChain
  };

};
