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

  // The trace data structure is only used as a dictionary in which
  // sampled choices are stored for later look up. In particular
  // `trace.score` is not maintained by this coroutine. All
  // scores/gradients are computed by a separate coroutine.

  function dreamSample(s, k, a, wpplFn) {
    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

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
        return this.k(this.s, this.record);
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
      throw new Error('dream: factor not supported, use observe instead.');
    },

    observe: function(s, k, a, dist) {
      if (!this.insideMapData) {
        throw new Error('dream: observe can only be used within mapData with this estimator.');
      }

      var val = dist.sample();
      this.observations.push(val);
      return k(s, val);
    },

    mapDataEnter: function() {
      this.observations = [];
    },

    mapDataLeave: function() {
      if (_.isEmpty(this.observations)) {
        throw new Error('dream: expected at least one observation to be made.');
      }
      // If there was only a single observation, unwrap it from the
      // array.
      var datum = this.observations.length === 1 ? this.observations[0] : this.observations;
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

      // The current implementation yields elements of the actual data
      // set to the observation function while fantasizing. This is to
      // support models that use the structure of an observation as
      // part of the generative process.

      // (Time series models that generate a sequence by mapping over
      // a sequence of observations for example.)

      // This may be unnecessary in many cases -- optimization may
      // work fine if we instead yielded e.g. `undefined`. But these
      // models that rely on the structure of an observation would
      // error out if we didn't do this.

      if (_.isEmpty(data)) {
        throw new Error('dream: data should be non empty.');
      }

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

  return {
    dreamSample: function() {
      var coroutine = Object.create(dreamSample.prototype);
      dreamSample.apply(coroutine, arguments);
      return coroutine.run();
    }
  };

};
