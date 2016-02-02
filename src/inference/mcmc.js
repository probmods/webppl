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
      burn: 0,
      callbacks: []
    });

    options.kernel = kernels.parseOptions(options.kernel);

    var callbacks = options.verbose ?
        [makeVMCallbackForPlatform()].concat(options.callbacks) :
        options.callbacks;

    var aggregator = (options.justSample || options.onlyMAP) ?
        new aggregation.MAP(options.justSample) :
        new aggregation.Histogram();

    var initialize, run, finish;

    initialize = function() {
      _.invoke(callbacks, 'initialize');
      return Initialize(run, wpplFn, s, env.exit, a, { ad: options.kernel.adRequired });
    };

    run = function(initialTrace) {
      initialTrace.info = { accepted: 0, total: 0 };
      var callback = kernels.tap(function(trace) { _.invoke(callbacks, 'iteration', trace); });
      var collectSample = makeExtractValue(aggregator.add.bind(aggregator));
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
      return k(s, aggregator.toERP());
    };

    return initialize();
  }

  function makeExtractValue(fn) {
    return kernels.tap(function(trace) {
      fn(trace.value, trace.score);
    });
  }

  // Callbacks.

  function makeVMCallback(opts) {
    var curIter = 0;
    return {
      iteration: function(trace) {
        opts.iteration(curIter++);
      },
      finish: function(trace) {
        opts.finish(trace, curIter - 1);
      }
    };
  }

  function makeSimpleVMCallback() {
    return makeVMCallback({
      iteration: function(i) {
        console.log(formatCurIteration(i));
      },
      finish: function(trace) {
        console.log(formatAcceptanceRatio(trace));
      }
    });
  }

  // Node.js only.
  function makeOverwritingVMCallback() {
    var writeCurIter = function(i) {
      process.stdout.write('\r' + formatCurIteration(i));
    };
    return makeVMCallback({
      iteration: _.throttle(writeCurIter, 200, { trailing: false }),
      finish: function(trace, i) {
        writeCurIter(i);
        console.log('\n' + formatAcceptanceRatio(trace));
      }
    });
  }

  function formatCurIteration(i) {
    return 'Iteration: ' + i;
  }

  function formatAcceptanceRatio(trace) {
    return 'Acceptance ratio: ' + (trace.info.accepted / trace.info.total);
  }

  function makeVMCallbackForPlatform() {
    return util.runningInBrowser() ? makeSimpleVMCallback() : makeOverwritingVMCallback();
  }

  return {
    MCMC: MCMC
  };

};
