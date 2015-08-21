'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');
var Trace = require('../trace');
var Particle = require('../particle');
var assert = require('assert');
var Histogram = require('../histogram');

module.exports = function(env) {

  function ParticleFilter(s, k, a, wpplFn, options) {

    this.rejuvSteps = options.rejuvSteps;
    this.rejuvKernel = options.rejuvKernel;
    this.numParticles = options.particles;

    this.particles = [];
    this.particleIndex = 0;
    this.particlesAtExit = false;

    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };

    // Create initial particles/traces.
    for (var i = 0; i < this.numParticles; i++) {
      var p = new (this.rejuvSteps === 0 ? Particle : Trace)();
      p.saveContinuation(exitK, _.clone(s));
      this.particles.push(p);
    }

    this.k = k;
    this.s = s;
    this.a = a;
    this.coroutine = env.coroutine;
    env.coroutine = this;

  }

  ParticleFilter.prototype.run = function() {
    return this.runCurrentParticle();
  };

  ParticleFilter.prototype.sample = function(s, k, a, erp, params) {
    var importanceERP = erp.importanceERP || erp;
    var val = importanceERP.sample(params);
    var importanceScore = importanceERP.score(params, val);
    var choiceScore = erp.score(params, val);
    var particle = this.currentParticle();
    particle.addChoice(erp, params, val, a, s, k);
    particle.logWeight += choiceScore - importanceScore;
    return k(s, val);
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle.
    var particle = this.currentParticle();
    particle.saveContinuation(cc, s);
    particle.score += score;
    particle.logWeight += score;

    if (this.particlesAtExit) {
      // Continue with current particle to exit.
      return this.runCurrentParticle();
    } else if (this.lastParticle()) {
      this.nextParticle();
      this.resampleParticles();
      return this.rejuvenateParticles(this.runCurrentParticle.bind(this), a);
    } else {
      this.nextParticle();
      return this.runCurrentParticle();
    }
  };

  ParticleFilter.prototype.lastParticle = function() {
    return this.particleIndex === this.numParticles - 1;
  };

  ParticleFilter.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilter.prototype.runCurrentParticle = function() {
    return this.currentParticle().k(this.currentParticle().store);
  };

  ParticleFilter.prototype.nextParticle = function() {
    this.particleIndex = (this.particleIndex + 1) % this.numParticles;
  };

  ParticleFilter.prototype.resampleParticles = function() {
    // Assume we are doing ParticleFilterAsMH when numParticles == 1.
    if (this.numParticles > 1) { return this.resampleResidual(); }
  };

  ParticleFilter.prototype.resampleMultinomial = function() {
    var ws = _.map(this.particles, function(p) { return Math.exp(p.logWeight); });
    var logAvgW = util.logsumexp(_.pluck(this.particles, 'logWeight')) - Math.log(this.numParticles);
    assert(logAvgW !== -Infinity, 'All particles have zero weight.');

    this.particles = _.times(this.numParticles, function(i) {
      var ix = erp.multinomialSample(ws);
      var p = this.particles[ix].copy();
      p.logWeight = logAvgW;
      return p;
    }, this);
  };

  ParticleFilter.prototype.resampleResidual = function() {
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.numParticles;
    var logW = util.logsumexp(_.pluck(this.particles, 'logWeight'));
    var logAvgW = logW - Math.log(m)

    assert(logAvgW !== -Infinity, 'All particles have zero weight.');

    // Compute list of retained particles.
    var retainedParticles = [];
    var newWeights = [];
    _.each(
        this.particles,
        function(particle) {
          var w = Math.exp(particle.logWeight - logAvgW);
          var nRetained = Math.floor(w);
          newWeights.push(w - nRetained);
          for (var i = 0; i < nRetained; i++) {
            retainedParticles.push(particle.copy());
          }
        });

    // Compute new particles.
    var numNewParticles = m - retainedParticles.length;
    var newParticles = [];
    var j;
    for (var i = 0; i < numNewParticles; i++) {
      j = erp.multinomialSample(newWeights);
      newParticles.push(this.particles[j].copy());
    }

    // Particles after update: retained + new particles.
    this.particles = newParticles.concat(retainedParticles);

    // Reset all weights.
    _.each(this.particles, function(p) { p.logWeight = logAvgW; });
  };

  ParticleFilter.prototype.rejuvenateParticles = function(cont, exitAddress) {
    if (this.rejuvSteps === 0) { return cont(); }
    assert(!this.particlesWeighted(), 'Cannot rejuvenate weighted particles.');
    var kernel = _.partial(this.rejuvKernel, _, _, exitAddress);
    return util.cpsForEach(
        function(p, i, ps, next) {
          return this.rejuvenateParticle(next, i, kernel);
        }.bind(this),
        cont,
        this.particles
    );
  };

  ParticleFilter.prototype.rejuvenateParticle = function(cont, i, kernel) {
    return util.cpsIterate(
        this.rejuvSteps, this.particles[i], kernel,
        function(rejuvParticle) {
          this.particles[i] = rejuvParticle;
          return cont();
        }.bind(this));
  };

  ParticleFilter.prototype.particlesWeighted = function() {
    var lw = _.first(this.particles).logWeight;
    return _.any(this.particles, function(p) { return p.logWeight !== lw; });
  };

  ParticleFilter.prototype.exit = function(s, val) {
    // Complete the trace.
    this.currentParticle().complete(val);

    if (!this.particlesAtExit) {
      // First particle has reached exit.
      // To handle variable numbers of factors we now run all particles to the end.
      // Rather than tracking which particles have finished, move the current
      // particle to the beginning of the array and continue as normal.
      this.particlesAtExit = true;
      util.swapElements(this.particles, 0, this.particleIndex);
      this.particleIndex = 0;
    }

    if (!this.lastParticle()) {
      this.nextParticle();
      return this.runCurrentParticle();
    }

    if (this.particlesWeighted()) {
      this.resampleParticles();
    }

    // Finished, call original continuation.
    env.coroutine = this.coroutine;
    return this.k(this.s, this.particles);
  };

  ParticleFilter.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function withImportanceDist(s, k, a, erp, importanceERP) {
    var newERP = _.clone(erp);
    newERP.importanceERP = importanceERP;
    return k(s, newERP);
  }

  function SMC(s, k, a, wpplFn, options) {
    var options = _.defaults(_.clone(options), { particles: 100, rejuvSteps: 0, rejuvKernel: MHKernel });

    return new ParticleFilter(s, function(s, particles) {
      var hist = new Histogram();
      var logAvgW = _.first(particles).logWeight;

      return util.cpsForEach(
          function(particle, i, ps, k) {
            assert(particle.logWeight === logAvgW, 'Expected un-weighted particles.');
            if (particle.score === -Infinity) {
              // Can happen with one particle as we don't resample to allow
              // ParticleFilterAsMH.
              throw 'Particle score is -Infinity';
            }
            if (options.rejuvSteps === 0) {
              hist.add(particle.value);
            }
            // Final rejuvenation.
            return runMarkovChain(options.rejuvSteps, particle, options.rejuvKernel, null, hist.add.bind(hist), k);
          },
          function() {
            var dist = hist.toERP();
            dist.normalizationConstant = logAvgW;
            return k(s, dist);
          },
          particles);

    }, a, wpplFn, options).run();
  }

  return {
    withImportanceDist: withImportanceDist,
    SMC: SMC
  };

};
