////////////////////////////////////////////////////////////////////
// PMCMC

'use strict';

var _ = require('underscore');
var dists = require('../dists');
var util = require('../util')
var CountAggregator = require('../aggregation/CountAggregator');

module.exports = function(env) {

  function last(xs) {
    return xs[xs.length - 1];
  }


  function PMCMC(s, cc, a, wpplFn, options) {
    util.throwUnlessOpts(options, 'PMCMC');
    // Move old coroutine out of the way and install this as the
    // current handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    // Store continuation (will be passed dist at the end)
    this.k = cc;

    this.oldStore = s;

    // Setup inference variables
    this.particleIndex = 0;  // marks the active particle
    this.retainedParticle = undefined;
    this.numSweeps = options.sweeps;
    this.sweep = 0;
    this.wpplFn = wpplFn;
    this.address = a;
    this.numParticles = options.particles;
    this.resetParticles();
    this.hist = new CountAggregator();
  }

  PMCMC.prototype.run = function() {
    // Run first particle
    return this.activeContinuationWithStore();
  };

  PMCMC.prototype.resetParticles = function() {
    var that = this;
    // Create initial particles
    this.particles = [];
    var exitK = function(s) {
      return that.wpplFn(s, env.exit, that.address);
    };
    for (var i = 0; i < this.numParticles; i++) {
      var particle = {
        continuations: [exitK],
        stores: [that.oldStore],
        weights: [0],
        value: undefined
      };
      this.particles.push(_.clone(particle));
    }
  };

  PMCMC.prototype.activeParticle = function() {
    return this.particles[this.particleIndex];
  };

  PMCMC.prototype.activeContinuation = function() {
    return last(this.activeParticle().continuations);
  };

  PMCMC.prototype.activeContinuationWithStore = function() {
    var k = last(this.activeParticle().continuations);
    var s = _.clone(last(this.activeParticle().stores));
    return function() {
      return k(s);
    };
  };

  PMCMC.prototype.allParticlesAdvanced = function() {
    return ((this.particleIndex + 1) === this.particles.length);
  };

  PMCMC.prototype.sample = function(s, cc, a, dist) {
    return cc(s, dist.sample());
  };

  PMCMC.prototype.particleAtStep = function(particle, step) {
    // Returns particle s.t. particle.continuations[step] is the last entry
    return {
      continuations: particle.continuations.slice(0, step + 1),
      stores: particle.stores.slice(0, step + 1),
      weights: particle.weights.slice(0, step + 1),
      value: particle.value
    };
  };

  PMCMC.prototype.updateActiveParticle = function(weight, continuation, store) {
    var particle = this.activeParticle();
    particle.continuations = particle.continuations.concat([continuation]);
    particle.stores = particle.stores.concat([_.clone(store)]);
    particle.weights = particle.weights.concat([weight]);
  };

  PMCMC.prototype.copyParticle = function(particle) {
    return {
      continuations: particle.continuations.slice(0),
      weights: particle.weights.slice(0),
      value: particle.value,
      stores: particle.stores.map(_.clone)
    };
  };

  PMCMC.prototype.resampleParticles = function(particles) {
    var weights = particles.map(
        function(particle) {
          return Math.exp(last(particle.weights));
        });

    var j;
    var newParticles = [];
    for (var i = 0; i < particles.length; i++) {
      j = dists.discreteSample(weights);
      newParticles.push(this.copyParticle(particles[j]));
    }

    return newParticles;
  };

  PMCMC.prototype.factor = function(s, cc, a, score) {

    this.updateActiveParticle(score, cc, s);

    if (this.allParticlesAdvanced()) {
      if (this.sweep > 0) {
        // This is not the first sweep, so we have a retained particle;
        // take that into account when resampling
        var particles = this.particles;
        var step = this.particles[0].continuations.length - 1;
        particles = particles.concat(this.particleAtStep(this.retainedParticle, step));
        this.particles = this.resampleParticles(particles).slice(1);
      } else {
        // No retained particle - standard particle filtering
        this.particles = this.resampleParticles(this.particles);
      }
      this.particleIndex = 0;
    } else {
      // Move next particle along
      this.particleIndex += 1;
    }

    return this.activeContinuationWithStore();
  };

  PMCMC.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;

    if (!this.allParticlesAdvanced()) {

      // Wait for all particles to reach exit
      this.particleIndex += 1;
      return this.activeContinuationWithStore();

    } else {

      // Use all (unweighted) particles from the conditional SMC
      // iteration to estimate marginal distribution.
      if (this.sweep > 0) {
        this.particles.concat(this.retainedParticle).forEach(
            function(particle) {
              this.hist.add(particle.value);
            }.bind(this));
      }

      // Retain the first particle sampled after the final factor statement.
      this.retainedParticle = this.particles[0];

      if (this.sweep < this.numSweeps) {

        // Reset non-retained particles, restart
        this.sweep += 1;
        this.particleIndex = 0;
        this.resetParticles();
        return this.activeContinuationWithStore();

      } else {
        // Reinstate previous coroutine:
        env.coroutine = this.oldCoroutine;

        // Return from particle filter by calling original continuation:
        return this.k(this.oldStore, this.hist.toDist());

      }
    }
  };

  PMCMC.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function pmc(s, cc, a, wpplFn, options) {
    return new PMCMC(s, cc, a, wpplFn, options).run();
  }

  return {
    PMCMC: pmc
  };

};
