'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');
var Trace = require('../trace.js').Trace;
var assert = require('assert');

// This is a stripped down particle filter.
// 1. Is doesn't handle variable numbers of factors.
// 2. Multinomial resampling strategy.
// 3. No final rejevenation at exit.

module.exports = function(env) {

  function ParticleFilter(s, k, a, wpplFn, options) {

    // TODO: Set defaults.
    this.rejuvSteps = options.rejuvSteps;
    this.rejuvKernel = options.rejuvKernel;
    this.numParticles = options.numParticles;

    this.particles = [];
    this.particleIndex = 0;

    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };

    // Create initial particles.
    // Particles are partial traces.
    for (var i = 0; i < this.numParticles; i++) {
      var p = new Trace();
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

    var cont = function() {
      this.nextParticle();
      return this.runCurrentParticle();
    }.bind(this);

    // Resample/rejuvenate at the last particle.
    if (this.lastParticle()) {
      this.resampleParticles();
      return this.rejuvenateParticles(cont, a);
    } else {
      return cont();
    }
  };

  ParticleFilter.prototype.lastParticle = function() {
    return this.particleIndex === this.numParticles - 1;
  };

  ParticleFilter.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilter.prototype.nextParticle = function() {
    this.particleIndex = (this.particleIndex + 1) % this.numParticles;
  };

  ParticleFilter.prototype.runCurrentParticle = function() {
    return this.currentParticle().k(this.currentParticle().store);
  };

  ParticleFilter.prototype.resampleParticles = function() { return this.resampleResidual(); };

  ParticleFilter.prototype.resampleMultinomial = function() {
    var ws = _.map(this.particles, function(p) { return Math.exp(p.logWeight); });

    assert(_.some(ws, function(w) { return w > 0; }), 'No +ve weights: ' + ws);
    assert(_.every(ws, function(w) { return w >= 0; }));

    var logAvgW = util.logsumexp(_.pluck(this.particles, 'logWeight')) - Math.log(this.numParticles);

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

    // TODO: Return early if we're not doing rejuvenation.

    var lw = _.first(this.particles).logWeight;
    assert(
        _.every(this.particles, function(p) { return p.logWeight === lw; }),
        'Cannot rejuvenate weighted particles.');

    return util.cpsForEach(
        function(p, i, ps, next) {
          return this.rejuvenateParticle(next, i, exitAddress);
        }.bind(this),
        cont,
        this.particles
    );
  };

  ParticleFilter.prototype.rejuvenateParticle = function(cont, i, exitAddress) {
    var transition = _.partial(this.rejuvKernel, _, _, exitAddress);

    return util.cpsIterate(
        this.rejuvSteps, this.particles[i], transition,
        function(rejuvParticle) {
          this.particles[i] = rejuvParticle;
          return cont();
        }.bind(this));
  };

  ParticleFilter.prototype.exit = function(s, val) {
    // Complete the trace.
    this.currentParticle().complete(val);

    // Run any remaining particles.
    if (!this.lastParticle()) {
      this.nextParticle();
      return this.runCurrentParticle();
    }

    // Finished, call original continuation.
    env.coroutine = this.coroutine;
    return this.k(this.s, this.particles);
  };

  function withImportanceDist(s, k, a, erp, importanceERP) {
    var newERP = _.clone(erp);
    newERP.importanceERP = importanceERP;
    return k(s, newERP);
  }

  return {
    // TODO: Better names.
    ParticleFilterCore: function(s, k, a, wpplFn, options) {
      return new ParticleFilter(s, k, a, wpplFn, options).run();
    },
    // This exists so I have an init method other than rejection to demo.
    // TODO: Don't hard-code these options.
    PFInit: function(s, k, a, wpplFn, options) {
      return ParticleFilterCore(s, function(s, particles) {
        return k(s, particles[0]);
      }, a, wpplFn, { numParticles: 10, rejuvSteps: 0 });
    },
    withImportanceDist: withImportanceDist
  };

};
