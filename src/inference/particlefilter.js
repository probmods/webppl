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
      score: particle.score,
      value: particle.value,
      store: util.copyObj(particle.store)
    };
  }

  function copyParticles(particles) {
    return _.map(particles, function(particle) {
      return copyParticle(particle);
    });
  }

  function getopt(opt, defaultval) {
    return opt === undefined ? defaultval : opt;
  }

  function ParticleFilter(s, k, a, wpplFn, numParticles, opts) {
    // Extract options
    var strict = getopt(opts.strict, true);
    var justSample = getopt(opts.justSample, false);
    var saveHistory = getopt(opts.saveHistory, true);
    var verbose = getopt(opts.verbose, false);

    this.particles = [];
    this.particleIndex = 0;  // marks the active particle

    this.justSample = justSample;
    this.saveHistory = saveHistory;
    if (this.saveHistory)
      this.particleHistory = [];

    // Create initial particles
    var exitK = function(s) {return wpplFn(s, env.exit, a);};
    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: exitK,
        weight: 0,
        score: 0,
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
    var sampval = erp.sample(params);
    this.activeParticle().score += erp.score(params, sampval);
    return cc(s, sampval);
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle weight
    this.activeParticle().weight += score;
    this.activeParticle().score += score;
    this.activeParticle().continuation = cc;
    this.activeParticle().store = s;

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      this.particleIndex = this.firstRunningParticleIndex();
      // variable #factors: resampling can kill all continuing particles
      if (this.particleIndex < 0)
        this.finish();
      else
        return this.activeParticle().continuation(this.activeParticle().store);
    } else {
      // Advance to the next particle
      this.particleIndex = this.nextRunningParticleIndex();
      return this.activeParticle().continuation(this.activeParticle().store);
    }
  };

  ParticleFilter.prototype.activeParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilter.prototype.firstRunningParticleIndex = function() {
    return util.indexOfPred(this.particles, function(p) {return !p.completed});
  };

  ParticleFilter.prototype.nextRunningParticleIndex = function() {
    var ni = this.particleIndex + 1;
    var nxt = util.indexOfPred(this.particles, function(p) {return !p.completed}, ni);
    return nxt >= 0 ? nxt : util.indexOfPred(this.particles, function(p) {return !p.completed});
  };

  ParticleFilter.prototype.lastRunningParticleIndex = function() {
    return util.lastIndexOfPred(this.particles, function(p) {return !p.completed});
  };

  ParticleFilter.prototype.allParticlesAdvanced = function() {
    return this.particleIndex === this.lastRunningParticleIndex();
  };

  ParticleFilter.prototype.resampleParticles = function() {

    if (this.saveHistory)
    {
      this.particleHistory.push(copyParticles(this.particles));
    }

    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var W = util.logsumexp(_.map(this.particles, function(p) {return p.weight;}));
    var avgW = W - Math.log(m);

    if (avgW == -Infinity) {      // debugging: check if NaN
      if (this.strict) throw 'Error! All particles -Infinity'
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
        j = multinomialSample(newExpWeights);
        newParticles.push(copyParticle(this.particles[j]));
      }

      // Particles after update: Retained + new particles
      this.particles = newParticles.concat(retainedParticles);
    }

    // Reset all weights
    _.each(this.particles, function(particle) {particle.weight = avgW;});

    if (this.saveHistory)
    {
      this.particleHistory.push(copyParticles(this.particles));
    }
  };

  ParticleFilter.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;
    this.activeParticle().completed = true;
    // this should be negative if there are no valid next particles
    var nextRunningParticleIndex = this.nextRunningParticleIndex();
    var allParticlesFinished = nextRunningParticleIndex < 0;

    // Wait for all particles to reach exit.
    // variable #factors: check if any other particles are continuing
    if (!allParticlesFinished) {
      this.particleIndex = nextRunningParticleIndex;
      return this.activeParticle().continuation(this.activeParticle().store);
    }

    return this.finish();
  }

  ParticleFilter.prototype.finish = function()
      {
    // Compute marginal distribution from (unweighted) particles
    var hist = {};
    if (!this.justSample)
    {
      _.each(
          this.particles,
          function(particle) {
            var k = JSON.stringify(particle.value);
            if (hist[k] === undefined) {
              hist[k] = { prob: 0, val: particle.value };
            }
            hist[k].prob += 1;
          });
    }
    var dist = makeMarginalERP(hist);
    if (this.justSample)
      dist.samples = this.particles.slice();
    if (this.saveHistory)
      dist.particleHistory = this.particleHistory;

    // Save estimated normalization constant in erp (average particle weight)
    dist.normalizationConstant = this.particles[0].weight;

    // Reinstate previous coroutine:
    env.coroutine = this.oldCoroutine;

    // Return from particle filter by calling original continuation:
    return this.k(this.oldStore, dist);
  }


  function pf(s, cc, a, wpplFn, numParticles, opts) {
    opts = opts || {};
    return new ParticleFilter(s, cc, a, wpplFn, numParticles, opts).run();
  }

  return {
    ParticleFilter: pf
  };

};
