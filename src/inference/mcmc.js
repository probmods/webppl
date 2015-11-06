'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util');
var Query = require('../query').Query;
var aggregation = require('../aggregation');

module.exports = function(env) {

  var kernels = require('./kernels')(env);

  function MCMC(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      samples: 100,
      kernel: 'MH',
      lag: 0,
      burn: 0
    });

    var runWppl = function() { return wpplFn(_.clone(s), env.exit, a); };
    options.kernel = _.partial(kernels.parseOptions(options.kernel), _, runWppl);

    var log = function(s) {
      if (options.verbose) {
        console.log(s);
      }
    };

    var acceptedCount = 0;
    var aggregator = (options.justSample || options.onlyMAP) ?
        new aggregation.MAP(options.justSample) :
        new aggregation.Histogram();

    var initialize, run, finish;

    initialize = function() {
      return Initialize(run, runWppl);
    };

    run = function(s, initialTrace) {
      var logAccepted = kernels.tap(function(trace) { acceptedCount += trace.info.accepted; });
      var printCurrIter = makePrintCurrIteration(log);
      var collectSample = makeExtractValue(initialTrace, aggregator.add.bind(aggregator));
      var kernel = kernels.sequence(options.kernel, printCurrIter, logAccepted);
      var chain = kernels.sequence(
          kernels.repeat(options.burn, kernel),
          kernels.repeat(options.samples,
              kernels.sequence(
                  kernels.repeat(options.lag + 1, kernel),
                  collectSample)));
      return chain(finish, initialTrace);
    };

    finish = function() {
      var iterations = options.samples * (options.lag + 1) + options.burn;
      log('Acceptance ratio: ' + acceptedCount / iterations);
      return k(s, aggregator.toERP());
    };

    return initialize();
  }

  function makeExtractValue(initialTrace, fn) {
    var query = new Query();
    if (initialTrace.value === env.query) {
      query.addAll(env.query);
    }
    return kernels.tap(function(trace) {
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
    return kernels.tap(function() {
      log('Iteration: ' + i++);
    });
  }

  return {
    MCMC: MCMC
  };

};
