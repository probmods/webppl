'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');
var Trace = require('../trace');
var assert = require('assert');
var Histogram = require('../aggregation').Histogram;

module.exports = function(env) {

  function SMC(s, k, a, wpplFn, options) {
    var options = _.defaults(_.clone(options), { particles: 100, rejuvSteps: 0 });

    if (!options.rejuvKernel) {
      // Use MHKernel in permissive mode if doing ParticleFilterAsMH.
      options.rejuvKernel = _.partial(MHKernel, _, _, _, _, options.particles === 1);
    }

    this.rejuvSteps = options.rejuvSteps;
    this.rejuvKernel = options.rejuvKernel;
    this.numParticles = options.particles;
    this.debug = options.debug;

    this.particles = [];
    this.completeParticles = [];
    this.particleIndex = 0;

    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };

    // Create initial particles.
    for (var i = 0; i < this.numParticles; i++) {
      var trace = new (this.rejuvSteps === 0 ? TraceLite : Trace)();
      trace.saveContinuation(exitK, _.clone(s));
      this.particles.push(new Particle(trace));
    }

    this.k = k;
    this.s = s;
    this.a = a;
    this.coroutine = env.coroutine;
    env.coroutine = this;

  }

  SMC.prototype.run = function() {
    return this.runCurrentParticle();
  };

  SMC.prototype.sample = function(s, k, a, erp, params) {
    var importanceERP = erp.importanceERP || erp;
    var val = importanceERP.sample(params);
    var importanceScore = importanceERP.score(params, val);
    var choiceScore = erp.score(params, val);
    var particle = this.currentParticle();
    particle.trace.addChoice(erp, params, val, a, s, k);
    particle.logWeight += choiceScore - importanceScore;
    return k(s, val);
  };

  SMC.prototype.factor = function(s, k, a, score) {
    // Update particle.
    var particle = this.currentParticle();
    particle.trace.saveContinuation(k, s);
    particle.trace.score += score;
    particle.logWeight += score;
    this.debugLog('(' + this.particleIndex + ') Factor: ' + a);
    return this.sync(a);
  };

  SMC.prototype.atLastParticle = function() {
    return this.particleIndex === this.particles.length - 1;
  };

  SMC.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  SMC.prototype.runCurrentParticle = function() {
    var trace = this.currentParticle().trace;
    return trace.k(trace.store);
  };

  SMC.prototype.advanceParticleIndex = function() {
    this.particleIndex += 1;
  };

  SMC.prototype.allParticles = function() {
    return this.completeParticles.concat(this.particles);
  };

  function resampleParticles(particles) {

    // Skip resampling if doing ParticleFilterAsMH.
    if (particles.length === 1) {
      return particles;
    }

    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = particles.length;
    var logW = util.logsumexp(_.pluck(particles, 'logWeight'));
    var logAvgW = logW - Math.log(m);

    assert.notStrictEqual(logAvgW, -Infinity, 'All particles have zero weight.');

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

  SMC.prototype.rejuvenateParticles = function(cont, exitAddress) {
    if (this.rejuvSteps === 0) {
      return cont();
    }
    assert(!this.particlesAreWeighted(), 'Cannot rejuvenate weighted particles.');
    return util.cpsForEach(
        function(p, i, ps, next) {
          return this.rejuvenateParticle(next, i, exitAddress);
        }.bind(this),
        cont,
        this.particles
    );
  };

  SMC.prototype.rejuvenateParticle = function(cont, i, exitAddress) {
    var kernel = _.partial(this.rejuvKernel, _, _, exitAddress, this.particles[i].proposalBoundary);
    var chain = repeatKernel(this.rejuvSteps, kernel);
    return chain(function(trace) {
      this.particles[i].trace = trace;
      return cont();
    }.bind(this), this.particles[i].trace);
  };

  SMC.prototype.particlesAreWeighted = function() {
    var lw = _.first(this.particles).logWeight;
    return _.any(this.particles, function(p) { return p.logWeight !== lw; });
  };

  SMC.prototype.sync = function(address) {
    // Called at sync points factor and exit.
    // Either advance the next active particle, or if all particles have
    // advanced, perform re-sampling and rejuvenation.
    if (!this.atLastParticle()) {
      this.advanceParticleIndex();
      return this.runCurrentParticle();
    } else {
      this.debugLog('***** SYNC at ' + (address || 'EXIT') + ' *****');

      var resampledParticles = resampleParticles(this.allParticles());
      assert.strictEqual(resampledParticles.length, this.numParticles);

      var p = _.partition(resampledParticles, function(p) { return p.trace.isComplete(); });
      this.completeParticles = p[0], this.particles = p[1];

      this.debugLog('Active: ' + p[0].length + ' | Complete: ' + p[1].length + '\n');

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
        return this.finish();
      }
    }
  };

  SMC.prototype.debugLog = function(s) {
    if (this.debug) {
      console.log(s);
    }
  };

  SMC.prototype.exit = function(s, val) {
    // Complete the trace.
    this.currentParticle().trace.complete(val);
    this.debugLog('(' + this.particleIndex + ') Exit');
    return this.sync();
  };

  SMC.prototype.finish = function(s, val) {
    assert.strictEqual(this.completeParticles.length, this.numParticles);

    var hist = new Histogram();
    var logAvgW = _.first(this.completeParticles).logWeight;

    return util.cpsForEach(
        function(particle, i, ps, k) {
          assert.strictEqual(particle.logWeight, logAvgW, 'Expected un-weighted particles.');
          if (particle.trace.score === -Infinity) {
            // Can happen with one particle as we don't resample to allow
            // ParticleFilterAsMH.
            throw 'Particle score is -Infinity';
          }
          if (this.rejuvSteps === 0) {
            hist.add(particle.trace.value);
            return k();
          } else {
            // Final rejuvenation.
            var chain = repeatKernel(
                this.rejuvSteps,
                sequenceKernels(
                    this.rejuvKernel,
                    tapKernel(function(trace) { hist.add(trace.value); })));
            return chain(k, particle.trace);
          }
        }.bind(this),
        function() {
          var dist = hist.toERP();
          dist.normalizationConstant = logAvgW;
          env.coroutine = this.coroutine;
          return this.k(this.s, dist);
        }.bind(this),
        this.completeParticles);
  };

  SMC.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function withImportanceDist(s, k, a, erp, importanceERP) {
    var newERP = _.clone(erp);
    newERP.importanceERP = importanceERP;
    return k(s, newERP);
  }

  // Restrict rejuvenation to erps that come after proposal boundary.
  function setProposalBoundary(s, k, a) {
    if (env.coroutine.currentParticle) {
      var particle = env.coroutine.currentParticle();
      particle.proposalBoundary = particle.trace.length;
    }
    return k(s);
  }

  var Particle = function(trace) {
    this.trace = trace;
    this.logWeight = 0;
    this.proposalBoundary = 0;
  };

  Particle.prototype.copy = function() {
    var p = new Particle(this.trace.copy());
    p.logWeight = this.logWeight;
    p.proposalBoundary = this.proposalBoundary;
    return p;
  };

  // Minimal Trace-like structure used to avoid unnecessary overhead in SMC
  // without rejuvenation.

  var TraceLite = function() {};

  TraceLite.prototype.saveContinuation = function(continuation, store) {
    this.k = continuation;
    this.store = store;
  };

  TraceLite.prototype.addChoice = function() {};

  TraceLite.prototype.complete = function(value) {
    assert.strictEqual(this.value, undefined);
    this.value = value;
    this.k = this.store = undefined;
  };

  TraceLite.prototype.isComplete = function() {
    return this.k === undefined && this.store === undefined;
  };

  TraceLite.prototype.copy = function() {
    var t = new TraceLite();
    t.k = this.k;
    t.store = _.clone(this.store);
    t.value = this.value;
    return t;
  };

  function MarginalSMC(s, k, a, wpplFn, options) {
    return new SMC(s, k, a, wpplFn, options).run();
  }

  return {
    MarginalSMC: MarginalSMC,
    withImportanceDist: withImportanceDist,
    setProposalBoundary: setProposalBoundary
  };

};
