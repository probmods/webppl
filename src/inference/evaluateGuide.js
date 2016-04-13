'use strict';

var _ = require('underscore');
var util = require('../util');
var assert = require('assert');
var ad = require('../ad');

module.exports = function(env) {

  function evaluateGuide(s, k, a, wpplFn, options) {
    this.opts = util.mergeDefaults(options, {
      datumIndex: 0,
      particles: 100,
      params: {},
      debug: false
    });

    this.params = this.opts.params;

    this.particles = [];
    this.particleIndex = 0;

    // Create initial particles.
    for (var i = 0; i < this.opts.particles; i++) {
      this.particles.push(new Particle(function() {
        return wpplFn(s, env.exit, a);
      }));
    }

    this.s = s;
    this.k = k;
    this.a = a;

    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  evaluateGuide.prototype.run = function() {
    return this.runCurrentParticle();
  };

  evaluateGuide.prototype.sample = function(s, k, a, erp, params, options) {
    var _val, choiceScore, importanceScore;
    var _params = params && params.map(ad.value);

    if (options && _.has(options, 'guide') && !this.ignoreGuide) {
      var importanceERP = options.guide[0];
      var importanceParams = options.guide[1];
      var _importanceParams = importanceParams && importanceParams.map(ad.value);
      _val = importanceERP.sample(_importanceParams);
      choiceScore = erp.score(_params, _val);
      importanceScore = importanceERP.score(_importanceParams, _val);
    } else {
      throw 'Un-guided choice.';
    }

    var particle = this.currentParticle();
    particle.logWeight += choiceScore - importanceScore;

    var val = _val;
    return k(s, val);
  };

  evaluateGuide.prototype.factor = function(s, k, a, score) {
    // Update particle.
    var particle = this.currentParticle();
    particle.logWeight += ad.value(score);
    this.debugLog('(' + this.particleIndex + ') Factor: ' + a);
    return this.sync();
  };

  evaluateGuide.prototype.atLastParticle = function() {
    return this.particleIndex === this.particles.length - 1;
  };

  evaluateGuide.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  evaluateGuide.prototype.runCurrentParticle = function() {
    return this.currentParticle().cont();
  };

  evaluateGuide.prototype.advanceParticleIndex = function() {
    this.particleIndex += 1;
  };

  evaluateGuide.prototype.sync = function() {
    // Called at sync points factor and exit.
    // Either advance the next active particle, or if all particles have
    // advanced, perform re-sampling and rejuvenation.
    if (!this.atLastParticle()) {
      this.advanceParticleIndex();
      return this.runCurrentParticle();
    } else {

      // All particles are now expected to be at 'the' (I assume
      // there's one for now) factor statement corresponding to the
      // observation for the data point we're evaluating.

      // TODO: Handle multiple factors per-datum. By computing what?

      return this.finish();
    }
  };

  evaluateGuide.prototype.debugLog = function(s) {
    if (this.opts.debug) {
      console.log(s);
    }
  };

  evaluateGuide.prototype.exit = function(s, val) {
    // We bail at the observation.
    throw 'Unreachable.';
  };

  evaluateGuide.prototype.mapDataFetch = function(ixprev, data, options, address) {
    var ix = this.opts.datumIndex;
    if (ix < 0 || ix >= data.length) {
      throw 'Invalid datumIndex.';
    }
    return [this.opts.datumIndex];
  };

  evaluateGuide.prototype.finish = function() {
    var logWeights = _.pluck(this.particles, 'logWeight');
    return this.k(this.s, logWeights);
  };

  evaluateGuide.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function Particle(cont) {
    this.logWeight = 0;
    this.cont = cont;
  }

  return {
    evaluateGuide: function(s, k, a, wpplFn, options) {
      return new evaluateGuide(s, k, a, wpplFn, options).run();
    }
  };

};
