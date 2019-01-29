'use strict';

var _ = require('lodash');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');
var ad = require('../ad');
var cb = require('./callbacks');

module.exports = function(env) {

  var Initialize = require('./initialize')(env);
  var kernels = require('./kernels')(env);

  function MCMC(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      samples: 100,
      kernel: 'MH',
      lag: 0,
      burn: 0,
      verbose: false,
      onlyMAP: false,
      callbacks: []
    }, 'MCMC');

    options.kernel = kernels.parseOptions(options.kernel);

    var callbacks = cb.prepare(options.verbose ?
                               [makeVMCallbackForPlatform()].concat(options.callbacks) :
                               options.callbacks);
    callbacks.setup(numIters(options));

    var aggregator = new CountAggregator(options.onlyMAP);

    var getValAndScore = options.kernel.adRequired ?
        function(trace) {
          return {
            value: ad.valueRec(trace.value),
            score: ad.value(trace.score)
          };
        } : _.identity;

    var initialize, run, finish;

    initialize = function() {
      callbacks.initialize();
      return Initialize(run, wpplFn, s, env.exit, a, { ad: options.kernel.adRequired });
    };

    run = function(initialTrace) {
      initialTrace.info = { accepted: 0, total: 0 };
      var callback = kernels.tap(function(trace) { callbacks.iteration(trace); });
      var collectSample = kernels.tap(function(trace) {
        var obj = getValAndScore(trace);
        aggregator.add(obj.value, obj.score);
        callbacks.sample({value: obj.value, score: obj.score});
      });
      var kernel = kernels.sequence(options.kernel, callback);
      var chain = kernels.sequence(
          kernels.repeat(options.burn, kernel),
          kernels.repeat(options.samples,
              kernels.sequence(
                  kernels.repeat(options.lag + 1, kernel),
                  collectSample)));
      return chain(finish, initialTrace);
    };

    finish = function(trace) {
      callbacks.finish(trace);
      return k(s, aggregator.toDist());
    };

    return initialize();
  }

  function numIters(opts) {
    return opts.burn + (opts.lag + 1) * opts.samples;
  }

  // Callbacks.

  function makeVMCallback(opts) {
    var curIter = 0;
    return {
      iteration: function(trace) {
        opts.iteration(trace, curIter++);
      },
      finish: function(trace) {
        opts.finish(trace, curIter - 1);
      }
    };
  }

  function makeSimpleVMCallback() {
    return makeVMCallback({
      iteration: function(trace, i) {
        console.log(formatOutput(trace, i));
      },
      finish: _.identity
    });
  }

  // Node.js only.
  function makeOverwritingVMCallback() {
    var writeCurIter = function(trace, i) {
      process.stdout.write('\r' + formatOutput(trace, i));
    };
    return makeVMCallback({
      iteration: _.throttle(writeCurIter, 200, { trailing: false }),
      finish: function(trace, i) {
        writeCurIter(trace, i);
        console.log();
      }
    });
  }

  function formatOutput(trace, i) {
    var ratio = (trace.info.total === 0) ? 0 : trace.info.accepted / trace.info.total;
    return 'Iteration: ' + i + ' | Acceptance ratio: ' + ratio.toFixed(4);
  }

  function makeVMCallbackForPlatform() {
    return util.runningInBrowser() ? makeSimpleVMCallback() : makeOverwritingVMCallback();
  }

  return {
    MCMC: MCMC
  };

};
