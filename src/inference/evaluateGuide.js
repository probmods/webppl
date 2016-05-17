'use strict';

var _ = require('underscore');
var util = require('../util');
var ad = require('../ad');

module.exports = function(env) {

  function EvaluateGuide(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      datumIndices: [], //if this is an array, use multiple data points, if it is [] use all data.
      samples: 100,
      params: {}
    });

    this.params = this.opts.params;
    this.opts.datumIndices = _.isArray(this.opts.datumIndices) ? this.opts.datumIndices : [this.opts.datumIndices];

    this.wpplFn = wpplFn;
    this.s = s;
    this.k = k;
    this.a = a;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  EvaluateGuide.prototype = {


    run: function() {

      var logWeights = [];

      return util.cpsLoop(
          this.opts.samples,

          // Loop body.
          function(i, next) {
            return this.computeImportanceWeight(function(logWeight) {
              logWeights.push(logWeight);
              return next();
            });
          },

          // Loop continuation.
          function() {
            var logESS = computeLogESS(logWeights);
            env.coroutine = this.coroutine;
            return this.k(this.s, Math.exp(logESS));
          },

          this);

    },

    computeImportanceWeight: function(cont) {
      // Draw a single sample from the guide and compute the
      // unnormalized importance weight when used as an importance
      // sampler for the target.

      // Rather than doing importance sampling for the full posterior
      // we focus on the posterior for a single datum. We compute the
      // (unnormalized) probability for use in the importance weight
      // as:

      // p(global, local_i | datum_i)
      // \prop p(global, local_i, datum_i)
      // = p(global) p(local_i, datum_i | global)

      // This makes use of our assumption that the data are IID.

      // The proposal distribution for the importance sampler is:

      // q(global, local_i)

      // We can use `mapData` to sample from this. i.e. to sample only
      // a subset of the local variables.

      // p(global, local_i, datum_i) (i.e. the score under the target)
      // is computed as we sample from the guide. (Following the
      // factorization above.)

      this.logp = 0;
      this.logq = 0;

      return this.wpplFn(_.clone(this.s), function() {

        var logWeight = this.logp - this.logq;
        return cont(logWeight);

      }.bind(this), this.a);

    },

    sample: function(s, k, a, dist, options) {
      options = options || {};

      if (!_.has(options, 'guide')) {
        throw 'Guide not specified.';
      }

      // Sample from the guide.
      var guideDist = options.guide;
      var _val = guideDist.sample();

      // Compute scores.
      this.logp += ad.value(dist.score(_val));
      this.logq += ad.value(guideDist.score(_val));

      return k(s, _val);
    },

    factor: function(s, k, a, score) {
      this.logp += ad.value(score);
      return k(s);
    },

    mapDataFetch: function(ixprev, data, options, address) {
      return this.opts.datumIndices;
    },

    incrementalize: env.defaultCoroutine.incrementalize,
    constructor: EvaluateGuide

  };

  function computeLogESS(logWeights) {
    // Compute ESS (Effective Sample Size) as:
    // ESS = (sum w_i)^2 / sum(w_i^2)
    //
    // Where each w_i is an unnormalized importance weight.
    //
    // This includes normalization, which also corrects for the fact
    // that we only know the score under the target upto a constant.
    //
    var doubleLogWeights = logWeights.map(function(x) { return x * 2; });
    return 2 * util.logsumexp(logWeights) - util.logsumexp(doubleLogWeights);
  }

  return {
    EvaluateGuide: function() {
      var coroutine = Object.create(EvaluateGuide.prototype);
      EvaluateGuide.apply(coroutine, arguments);
      return coroutine.run();
    }
  };

};
