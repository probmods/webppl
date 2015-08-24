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
    this.completeParticles = [];
    this.particleIndex = 0;

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

    //console.log('(' + this.particleIndex + ') Factor: ' + a);

    return this.sync(a);
  };

  ParticleFilter.prototype.lastParticle = function() {
    return this.particleIndex === this.particles.length - 1;
  };

  ParticleFilter.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilter.prototype.runCurrentParticle = function() {
    return this.currentParticle().k(this.currentParticle().store);
  };

  ParticleFilter.prototype.nextParticle = function() {
    this.particleIndex += 1;
  };

  ParticleFilter.prototype.allParticles = function() {
    return this.particles.concat(this.completeParticles);
  };

  function resampleParticles(particles) {

    // Skip resampling if doing ParticleFilterAsMH.
    if (particles.length === 1) { return particles; }

    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = particles.length;
    var logW = util.logsumexp(_.pluck(particles, 'logWeight'));
    var logAvgW = logW - Math.log(m);

    assert(logAvgW !== -Infinity, 'All particles have zero weight.');

    // Compute list of retained particles.
    var retainedParticles = [];
    var newWeights = [];
    _.each(
        particles,
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
      newParticles.push(particles[j].copy());
    }

    // Particles after update: retained + new particles.
    var allParticles = newParticles.concat(retainedParticles);

    // Reset all weights.
    _.each(allParticles, function(p) { p.logWeight = logAvgW; });

    return allParticles;
  }

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

  ParticleFilter.prototype.sync = function(address) {
    // Called at sync points factor and exit.
    // Either advance the next active particle, or if all particles have
    // advanced, perform re-sampling and rejuvenation.
    if (this.lastParticle()) {
      //console.log('*** SYNC *** [' + (address || 'exit') + ']');

      var resampledParticles = resampleParticles(this.allParticles());
      assert(resampledParticles.length === this.numParticles);

      // TODO: Move logic for checking for complete particles to Particle/Trace?
      var p = _.partition(resampledParticles, function(p) { return p.k && p.store; });
      this.particles = p[0], this.completeParticles = p[1];

      //console.log('RESAMPLED | Active: ' + p[0].length + ' | Complete: ' + p[1].length + '\n');

      if (this.particles.length > 0) {
        // We still have active particles, wrap-around:
        this.particleIndex = 0;

        // TODO: Rejuvenation particles at factors when sync is called from exit.

        // Since some particles might be at factor statements and some at the
        // exit. If we also saved the address when we save the continuation we
        // can use this to rejuvenate the particles at factor statements. (And
        // do so using their particular address, rather than the address of the
        // factor statement reached by the last particle.)

        if (address) {
          // Rejuvenate if called from factor statement.
          return this.rejuvenateParticles(this.runCurrentParticle.bind(this), address);
        } else {
          return this.runCurrentParticle();
        }

      } else {
        // All particles complete.
        assert(this.completeParticles.length === this.numParticles);
        env.coroutine = this.coroutine;
        return this.k(this.s, this.completeParticles);
      }
    } else {
      this.nextParticle();
      return this.runCurrentParticle();
    }
  };

  ParticleFilter.prototype.exit = function(s, val) {
    // Complete the trace.
    this.currentParticle().complete(val);
    //console.log('(' + this.particleIndex + ') Exit');
    return this.sync();
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
              return k();
            } else {
              // Final rejuvenation.
              return runMarkovChain(options.rejuvSteps, particle, options.rejuvKernel, null, hist.add.bind(hist), k);
            }
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
