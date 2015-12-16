'use strict';

var _ = require('underscore');
var util = require('../util');
var aggregation = require('../aggregation');

module.exports = function(env) {

  var Initialize = require('./initialize')(env);
  var kernels = require('./kernels')(env);

  function MCMC(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      samples: 100,
      kernel: 'MH',
      lag: 0,
      burn: 0
    });

    options.kernel = kernels.parseOptions(options.kernel);

    var log = function(s) {
      if (options.verbose) {
        console.log(s);
      }
    };

    var aggregator = (options.justSample || options.onlyMAP) ?
        new aggregation.MAP(options.justSample) :
        new aggregation.Histogram();

    var initialize, run, finish;

    initialize = function() {
      return Initialize(run, wpplFn, s, env.exit, a, { ad: options.kernel.adRequired });
    };

    run = function(initialTrace) {
      initialTrace.info = { accepted: 0, total: 0 };
      var printCurrIter = makePrintCurrIteration(log);
      var collectSample = makeExtractValue(aggregator.add.bind(aggregator));
      var kernel = kernels.sequence(options.kernel, printCurrIter);
      var chain = kernels.sequence(
          kernels.repeat(options.burn, kernel),
          kernels.repeat(options.samples,
              kernels.sequence(
                  kernels.repeat(options.lag + 1, kernel),
                  collectSample)));
      return chain(finish, initialTrace);
    };

    finish = function(trace) {
      log('Acceptance ratio: ' + trace.info.accepted / trace.info.total);
      return k(s, aggregator.toERP());
    };

    return initialize();
  }

  function makeExtractValue(fn) {
    return kernels.tap(function(trace) {
      fn(trace.value, trace.score);
    });
  }

  function makePrintCurrIteration(log) {
    var i = 0;
    return kernels.tap(function() {
      log('Iteration: ' + i++);
    });
  }

  return {
    MCMC: MCMC
  };

};
