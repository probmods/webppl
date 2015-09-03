'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Query = require('../query.js').Query;
var aggregation = require('../aggregation');

module.exports = function(env) {

  function MCMC(s, k, a, wpplFn, options) {
    var options = _.defaults(_.clone(options), { samples: 100, kernel: MHKernel, lag: 0, burn: 0 });

    // TODO: Implement via hooks/callbacks.
    var log = function(s) {
      if (options.verbose) {
        console.log(s);
      }
    };

    var initialize = _.partial(Initialize, s, _, a, wpplFn);

    return initialize(function(s, initialTrace) {

      var aggregator = (options.justSample || options.onlyMAP) ?
          new aggregation.MAPEstimator(options.justSample) :
          new aggregation.Histogram();

      var acceptedCount = 0;
      var logAccepted = tapKernel(function(trace) { acceptedCount += trace.info.accepted; });
      var printCurrIter = makePrintCurrIteration(log);
      var collectSample = makeExtractValue(initialTrace, aggregator.add.bind(aggregator));

      var kernel = sequenceKernels(options.kernel, printCurrIter, logAccepted);

      var chain = sequenceKernels(
          repeatKernel(options.burn, kernel),
          repeatKernel(options.samples,
              sequenceKernels(
                  repeatKernel(options.lag, kernel),
                  composeKernels(kernel, collectSample))));

      return chain(function() {
        var iterations = options.samples * (options.lag + 1) + options.burn;
        log('Acceptance ratio: ' + acceptedCount / iterations);
        return k(s, aggregator.toERP());
      }, initialTrace);

    });
  }

  function makeExtractValue(initialTrace, fn) {
    var query = new Query();
    if (initialTrace.value === env.query) {
      query.addAll(env.query);
    }
    return tapKernel(function(trace) {
      var value;
      if (trace.value === env.query) {
        if (trace.info.accepted) {
          query.addAll(env.query);
        }
        value = query.getTable();
      } else {
        value = trace.value;
      }
      fn(value, trace.score);
    });
  }

  function makePrintCurrIteration(log) {
    var i = 0;
    return tapKernel(function() {
      log('Iteration: ' + i++);
    });
  }

  function tapKernel(fn) {
    return function(k, trace) {
      fn(trace);
      return k(trace);
    };
  }

  function sequenceKernels() {
    var kernels = arguments;
    assert(kernels.length > 0);
    if (kernels.length === 1) {
      return _.first(kernels);
    } else {
      return composeKernels(
          _.first(kernels),
          sequenceKernels.apply(null, _.rest(kernels)));
    }
  }

  function composeKernels(kernel1, kernel2) {
    return function(k, trace1) {
      return kernel1(function(trace2) {
        return kernel2(k, trace2);
      }, trace1);
    };
  }

  function repeatKernel(n, kernel) {
    return function(k, trace) {
      return util.cpsIterate(n, trace, kernel, k);
    };
  }

  return {
    MCMC: MCMC,
    tapKernel: tapKernel,
    repeatKernel: repeatKernel,
    composeKernels: composeKernels,
    sequenceKernels: sequenceKernels
  };

};
