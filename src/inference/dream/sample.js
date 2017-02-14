'use strict';

var _ = require('lodash');
var util = require('../../util');
var Trace = require('../../trace');
var guide = require('../../guide');

module.exports = function(env) {

  // This coroutine generates samples from something like "the
  // posterior predictive distribution over local random choices".

  // This amounts to sampling global choices (those outside of
  // mapData) from the guide, and local choices (those inside mapData)
  // from the target.

  // We assume we can generate samples from this distribution directly
  // by forward sampling. This implies that there should be no factor
  // statements in the model. (If there were we'd need to account for
  // this with e.g. importance sampling?)

  // The trace data structure is only used as a dictionary in which
  // sampled choices are stored for later look up. In particular
  // `trace.score` is not maintained by this coroutine. All
  // scores/gradients are computed by a separate coroutine.

  function dreamSample(wpplFn, s, a, cont) {
    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;
    this.cont = cont;

    // A 'record' stores random choices (in the trace) and the
    // fantasized data.
    var trace = new Trace(this.wpplFn, s, env.exit, a);
    this.record = {trace: trace, data: []};

    this.guideRequired = true;
    this.insideMapData = false;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  dreamSample.prototype = {

    run: function() {
      return this.wpplFn(_.clone(this.s), function(s, val) {
        env.coroutine = this.coroutine;
        return this.cont(this.record);
      }.bind(this), this.a);
    },

    sample: function(s, k, a, dist, options) {
      var sampleFn = this.insideMapData ? this.sampleLocal : this.sampleGlobal;
      return sampleFn.call(this, s, a, dist, options, function(s, val) {
        this.record.trace.addChoice(dist, val, a, s, k, options);
        return k(s, val);
      }.bind(this));
    },

    sampleLocal: function(s, a, targetDist, options, k) {
      return k(s, targetDist.sample());
    },

    sampleGlobal: function(s, a, dist, options, k) {
      options = options || {};
      return guide.getDist(
        options.guide, options.noAutoGuide, dist, env, s, a,
        function(s, guideDist) {
          if (!guideDist) {
            throw new Error('dream: No guide distribution specified.');
          }
          return k(s, guideDist.sample());
        });
    },

    factor: function(s, k, a) {
      // See comments at top of this file.
      throw new Error('dream: factor not supported, use observe instead.');
    },

    observe: function(s, k, a, dist) {
      if (!this.insideMapData) {
        throw new Error('dream: observe can only be used within mapData with this estimator.');
      }
      if (!this.obsArr && this.obs.length !== 0) {
        throw new Error('dream: Expected to see only a single observe per data point.');
      }

      var val = dist.sample();
      this.obs.push(val);
      return k(s, val);
    },

    mapDataEnter: function() {
      this.obs = [];
    },

    mapDataLeave: function() {
      var datum = this.obsArr ? this.obs : this.obs[0];
      this.record.data.push(datum);
    },

    mapDataFetch: function(data, opts, a) {
      if (this.insideMapData) {
        throw new Error('dream: nested mapData is not supported by this estimator.');
      }
      this.insideMapData = true;

      var batchSize = _.has(opts, 'dreamBatchSize') ? opts.dreamBatchSize : 1;
      if (!(util.isInteger(batchSize) && batchSize >= 0)) {
        throw new Error('dream: dreamBatchSize should be a non negative integer.');
      }

      if (_.isEmpty(data)) {
        // In general, we need data to yield to the observation
        // function in order to generate fantasy data.
        throw new Error('dream: data should be non empty.');
      }

      // Flag indicating whether each element of the original data is
      // an array of observations or a single observation. (We check
      // the first datum, and assume the rest of data would return the
      // same.)
      this.obsArr = _.isArray(data[0]);

      var ix = _.times(batchSize, function() {
        return Math.floor(util.random() * data.length);
      });
      var batch = _.at(data, ix);

      // We extend the address used to enter mapData so that addresses
      // used while fantasizing don't overlap with those used when
      // mapping over the real data.

      // We don't return the original indices since it's not important
      // that these are included in the address used to call the
      // observation function.
      return {data: batch, ix: null, address: a + '_dream'};
    },

    mapDataFinal: function() {
      this.insideMapData = false;
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: dreamSample

  };

  return function() {
    var coroutine = Object.create(dreamSample.prototype);
    dreamSample.apply(coroutine, arguments);
    return coroutine.run();
  };

};
