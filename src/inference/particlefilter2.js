'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');
var Trace = require('../trace.js').Trace;

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
    particle.weight += choiceScore - importanceScore;
    return k(s, val);
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle.
    var particle = this.currentParticle();
    particle.saveContinuation(cc, s);
    particle.score += score;
    particle.weight += score;

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

  ParticleFilter.prototype.resampleParticles = function() {
    var ws = _.map(this.particles, function(p) { return Math.exp(p.weight); });

    assert(_.some(ws, function(w) { return w > 0; }), 'No +ve weights: ' + ws);
    assert(_.every(ws, function(w) { return w >= 0; }));

    this.particles = _.times(this.numParticles, function(i) {
      var ix = erp.multinomialSample(ws);
      var p = this.particles[ix].copy();
      assert(p.weight === 0);
      return p;
    }, this);
  };

  // TODO: How can this be written in a more straight-foward way.

  // TODO: k here isn't a webppl continuation, rather it's a thunk, created in
  // factor. This doesn't need to be called with arguments and I don't think I
  // need to pass s & a around either.

  ParticleFilter.prototype.rejuvenateParticles = function(cont, exitAddress) {

    assert(
        _.every(this.particles, function(p) { return p.weight === 0; }),
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

    // TODO: Check this is correct.

    // My intention is to run wpplFn with the same address as was used for the
    // particle filter so that addresses line up correctly with the trace. I'm
    // not sure I need to do this since the MHKernel will pick continue using
    // the address of an entry in the trace.

    // transition :: wpplFn x trace -> trace
    var transition = _.partial(this.rejuvKernel, this.s, _, this.a, this.wpplFn, _, exitAddress);

    var particle = this.particles[i];

    // TODO: This is similar to MCMC with initialization. Extract?

    return util.cpsLoop(this.rejuvSteps,
        function(j, next) {
          //console.log('Step: ' + j);
          return transition(function(s, newParticle) {
            particle = newParticle;
            return next();
          }, particle);
        },
        function() {
          this.particles[i] = particle;
          return cont();
        }.bind(this)
    );
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
