'use strict';

var _ = require('underscore');
var util = require('../util');
var CountAggregator = require('../aggregation/CountAggregator');
var MaxAggregator = require('../aggregation/MaxAggregator');
var ad = require('../ad');

module.exports = function(env) {

  var Initialize = require('./initialize')(env);
  var kernels = require('./kernels')(env);

  function MCMC(s, k, a, wpplFn, options) {
    util.throwUnlessOpts(options, 'MCMC');
    var options = util.mergeDefaults(options, {
      samples: 100,
      kernel: 'MH',
      lag: 0,
      burn: 0,
      callbacks: []
    });

    options.kernel = kernels.parseOptions(options.kernel);

    var callbacks = options.verbose ?
        [makeVMCallbackForPlatform()].concat(options.callbacks) :
        options.callbacks;
    _.invoke(callbacks, 'setup', numIters(options));

    var aggregator = (options.justSample || options.onlyMAP) ?
        new MaxAggregator(options.justSample) :
        new CountAggregator();

    var addToAggregator = options.kernel.adRequired ?
        function(value, score) { aggregator.add(ad.valueRec(value), ad.value(score)); } :
        aggregator.add.bind(aggregator);

    var initialize, run, finish;

    initialize = function() {
      _.invoke(callbacks, 'initialize');
      return Initialize(run, wpplFn, s, env.exit, a, { ad: options.kernel.adRequired });
    };

    run = function(initialTrace) {
      initialTrace.info = { accepted: 0, total: 0 };
      var callback = kernels.tap(function(trace) { _.invoke(callbacks, 'iteration', trace); });
      var collectSample = makeExtractValue(addToAggregator);
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
      _.invoke(callbacks, 'finish', trace);
      return k(s, aggregator.toDist());
    };

    return initialize();
  }

  function makeExtractValue(fn) {
    return kernels.tap(function(trace) {
      fn(trace.value, trace.score);
    });
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
    var ratio = (trace.info.accepted / trace.info.total).toFixed(4);
    return 'Iteration: ' + i + ' | Acceptance ratio: ' + ratio;
  }

  function makeVMCallbackForPlatform() {
    return util.runningInBrowser() ? makeSimpleVMCallback() : makeOverwritingVMCallback();
  }

  return {
    MCMC: MCMC
  };

};
