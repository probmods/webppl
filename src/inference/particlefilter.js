////////////////////////////////////////////////////////////////////
// Particle filtering
//
// Sequential importance re-sampling, which treats 'factor' calls as
// the synchronization / intermediate distribution points.

'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');


module.exports = function(env) {

  function copyParticle(particle) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      value: particle.value,
      store: util.copyObj(particle.store)
    };
  }

  function ParticleFilter(s, k, a, wpplFn, numParticles, strict) {

    this.particles = [];
    this.particleIndex = 0;  // marks the active particle

    // Create initial particles
    var exitK = function(s) {return wpplFn(s, env.exit, a);};
    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: exitK,
        weight: 0,
        value: undefined,
        store: util.copyObj(s)
      };
      this.particles.push(particle);
    }

    this.strict = strict;
    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = util.copyObj(s); // will be reinstated at the end
  }

  ParticleFilter.prototype.run = function() {
    // Run first particle
    return this.activeParticle().continuation(this.activeParticle().store);
  };

  ParticleFilter.prototype.sample = function(s, cc, a, erp, params) {
    return cc(s, erp.sample(params));
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle weight
    this.activeParticle().weight += score;
    this.activeParticle().continuation = cc;
    this.activeParticle().store = s;

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      this.particleIndex = 0;
    } else {
      // Advance to the next particle
      this.particleIndex += 1;
    }

    return this.activeParticle().continuation(this.activeParticle().store);
  };

  ParticleFilter.prototype.activeParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilter.prototype.allParticlesAdvanced = function() {
    return ((this.particleIndex + 1) === this.particles.length);
  };

  ParticleFilter.prototype.resampleParticles = function() {
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var W = util.logsumexp(_.map(this.particles, function(p) {return p.weight;}));
    var avgW = W - Math.log(m);

    if (avgW == -Infinity) {      // debugging: check if NaN
      if (this.strict) {
        throw 'Error! All particles -Infinity';
      }
    } else {
      // Compute list of retained particles
      var retainedParticles = [];
      var newExpWeights = [];
      _.each(
          this.particles,
          function(particle) {
            var w = Math.exp(particle.weight - avgW);
            var nRetained = Math.floor(w);
            newExpWeights.push(w - nRetained);
            for (var i = 0; i < nRetained; i++) {
              retainedParticles.push(copyParticle(particle));
            }});
      // Compute new particles
      var numNewParticles = m - retainedParticles.length;
      var newParticles = [];
      var j;
      for (var i = 0; i < numNewParticles; i++) {
        j = erp.multinomialSample(newExpWeights);
        newParticles.push(copyParticle(this.particles[j]));
      }

      // Particles after update: Retained + new particles
      this.particles = newParticles.concat(retainedParticles);
    }

    // Reset all weights
    _.each(this.particles, function(particle) {particle.weight = avgW;});
  };

  ParticleFilter.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;

    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    if (!this.allParticlesAdvanced()) {
      this.particleIndex += 1;
      return this.activeParticle().continuation(this.activeParticle().store);
    }

    // Compute marginal distribution from (unweighted) particles
    var hist = {};
    _.each(
        this.particles,
        function(particle) {
          var k = JSON.stringify(particle.value);
          if (hist[k] === undefined) {
            hist[k] = { prob: 0, val: particle.value };
          }
          hist[k].prob += 1;
        });
    var dist = erp.makeMarginalERP(hist);

    // Save estimated normalization constant in erp (average particle weight)
    dist.normalizationConstant = this.particles[0].weight;

    // Reinstate previous coroutine:
    env.coroutine = this.oldCoroutine;

    // Return from particle filter by calling original continuation:
    return this.k(this.oldStore, dist);
  };

  function pf(s, cc, a, wpplFn, numParticles, strict) {
    return new ParticleFilter(s, cc, a, wpplFn, numParticles, strict === undefined ? true : strict).run();
  }

  return {
    ParticleFilter: pf
  };

};
