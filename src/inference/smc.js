'use strict';

var _ = require('lodash');
var util = require('../util');
var numeric = require('../math/numeric');
var discrete = require('../dists/discrete');
var Trace = require('../trace');

var assert = require('assert');
var CountAggregator = require('../aggregation/CountAggregator');
var ad = require('../ad');
var guide = require('../guide');

module.exports = function(env) {

  var kernels = require('./kernels')(env);

  var validImportanceOptVals = ['default', 'ignoreGuide', 'autoGuide'];

  function SMC(s, k, a, wpplFn, options) {
    var options = util.mergeDefaults(options, {
      particles: 100,
      rejuvSteps: 0,
      rejuvKernel: 'MH',
      finalRejuv: true,
      saveTraces: false,
      importance: 'default',
      onlyMAP: false,
      throwOnError: true
    }, 'SMC');

    if (!_.includes(validImportanceOptVals, options.importance)) {
      var msg = options.importance + ' is not a valid importance option. ' +
          'Valid options are: ' + validImportanceOptVals;
      throw new Error(msg);
    }
    this.throwOnError = options.throwOnError;

    this.rejuvKernel = kernels.parseOptions(options.rejuvKernel);
    this.rejuvSteps = options.rejuvSteps;

    this.performRejuv = this.rejuvSteps > 0;
    this.adRequired = this.performRejuv && this.rejuvKernel.adRequired;
    this.performFinalRejuv = this.performRejuv && options.finalRejuv;
    this.numParticles = options.particles;
    this.debug = options.debug;
    this.saveTraces = options.saveTraces;
    this.importanceOpt = options.importance;
    this.guideRequired = options.importance !== 'ignoreGuide';
    this.isParamBase = true;
    this.onlyMAP = options.onlyMAP;

    this.particles = [];
    this.completeParticles = [];
    this.particleIndex = 0;

    this.step = 0;

    // Create initial particles.
    for (var i = 0; i < this.numParticles; i++) {
      var trace = new Trace(wpplFn, s, env.exit, a);
      this.particles.push(new Particle(trace));
    }

    this.s = s;
    this.k = k;
    this.a = a;

    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  SMC.prototype.run = function() {
    return this.runCurrentParticle();
  };

  // Error function for error handling
  // this.throwOnError is true: directly throw error
  // this.throwOnError is false: return error (string) as infer result
  SMC.prototype.error = function(errType) {
    var err = new Error(errType);
    if (this.throwOnError) {
      throw err;
    } else {
      return this.k(this.s, err);
    }
  }

  SMC.prototype.sample = function(s, k, a, dist, options) {
    options = options || {};
    var thunk = (this.importanceOpt === 'ignoreGuide') ? undefined : options.guide;
    var noAutoGuide = (this.importanceOpt !== 'autoGuide') || options.noAutoGuide;
    return guide.getDist(thunk, noAutoGuide, dist, env, s, a, function(s, importanceDist) {

      var _val, choiceScore, importanceScore;
      if (importanceDist) {
        _val = importanceDist.sample();
        choiceScore = dist.score(_val);
        importanceScore = importanceDist.score(_val);
      } else {
        // No importance distribution, sample from prior.
        _val = dist.sample();
        choiceScore = importanceScore = dist.score(_val);
      }

      var particle = this.currentParticle();
      particle.logWeight += ad.value(choiceScore) - ad.value(importanceScore);

      var val = this.adRequired && dist.isContinuous ? ad.lift(_val) : _val;
      // Optimization: Choices are not required for PF without rejuvenation.
      if (this.performRejuv || this.saveTraces) {
        particle.trace.addChoice(dist, val, a, s, k, options);
      } else {
        particle.trace.score = ad.scalar.add(particle.trace.score, choiceScore);
      }
      return k(s, val);
    }.bind(this));
  };

  SMC.prototype.factor = function(s, k, a, score) {
    // Update particle.
    var particle = this.currentParticle();
    particle.trace.numFactors += 1;
    particle.trace.saveContinuation(s, k);
    particle.trace.score = ad.scalar.add(particle.trace.score, score);
    particle.logWeight += ad.value(score);
    this.debugLog('(' + this.particleIndex + ') Factor: ' + a);
    return this.sync();
  };

  SMC.prototype.atLastParticle = function() {
    return this.particleIndex === this.particles.length - 1;
  };

  SMC.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  SMC.prototype.runCurrentParticle = function() {
    return this.currentParticle().trace.continue();
  };

  SMC.prototype.advanceParticleIndex = function() {
    this.particleIndex += 1;
  };

  SMC.prototype.allParticles = function() {
    return this.completeParticles.concat(this.particles);
  };

  function resampleParticles(particles, cont) {
    // Skip resampling if doing ParticleFilterAsMH.
    if (particles.length === 1) {
      return cont(particles);
    }
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = particles.length;
    var logW = numeric._logsumexp(_.map(particles, 'logWeight'));
    var logAvgW = logW - Math.log(m);
    if (logAvgW === -Infinity) {
      // do not return, execution continues
      return env.coroutine.error('All particles have zero weight.');
    }
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
      j = discrete.sample(newWeights);
      newParticles.push(particles[j].copy());
    }

    // Particles after update: retained + new particles.
    var allParticles = newParticles.concat(retainedParticles);

    // Reset all weights.
    _.each(allParticles, function(p) { p.logWeight = logAvgW; });
    return cont(allParticles);
  }


  SMC.prototype.rejuvenateParticles = function(particles, cont) {
    if (!this.performRejuv) {
      return cont(particles);
    }

    assert(!this.particlesAreWeighted(particles), 'Cannot rejuvenate weighted particles.');

    return util.cpsForEach(
        function(p, i, ps, next) {
          return this.rejuvenateParticle(next, p);
        }.bind(this),
        function() {
          return cont(particles);
        },
        particles
    );
  };

  SMC.prototype.rejuvenateParticle = function(cont, particle) {
    var kernelOptions = { proposalBoundary: particle.proposalBoundary };
    if (this.performRejuv) {
      kernelOptions.exitFactor = this.step;
    }
    var kernel = _.partial(this.rejuvKernel, _, _, kernelOptions);
    var chain = kernels.repeat(this.rejuvSteps, kernel);
    return chain(function(trace) {
      particle.trace = trace;
      return cont();
    }, particle.trace);
  };

  SMC.prototype.particlesAreWeighted = function(particles) {
    var lw = _.head(particles).logWeight;
    return _.some(particles, function(p) { return p.logWeight !== lw; });
  };

  SMC.prototype.particlesAreInSync = function(particles) {
    // All particles are either at the step^{th} factor statement, or
    // at the exit having encountered < than step factor statements.
    return _.every(particles, function(p) {
      var trace = p.trace;
      return ((trace.isComplete() && trace.numFactors < this.step) ||
              (!trace.isComplete() && trace.numFactors === this.step));
    }.bind(this));
  };

  SMC.prototype.sync = function() {
    // Called at sync points factor and exit.
    // Either advance the next active particle, or if all particles have
    // advanced, perform re-sampling and rejuvenation.
    if (!this.atLastParticle()) {
      this.advanceParticleIndex();
      return this.runCurrentParticle();
    } else {
      this.step += 1;
      this.debugLog('***** sync :: step = ' + this.step + ' *****');

      // Resampling and rejuvenation are applied to all particles.
      // Active and complete particles are combined here and
      // re-partitioned after rejuvenation.
      var allParticles = this.allParticles();
      assert(this.particlesAreInSync(allParticles));
      return resampleParticles(allParticles, function(resampledParticles) {
        assert.strictEqual(resampledParticles.length, env.coroutine.numParticles);

        var numActiveParticles = _.reduce(resampledParticles, function(acc, p) {
          return acc + (p.trace.isComplete() ? 0 : 1);
        }, 0);
        if (numActiveParticles > 0) {
          // We still have active particles, wrap-around:
          this.particleIndex = 0;
          return this.rejuvenateParticles(resampledParticles, function(rejuvenatedParticles) {
            assert(this.particlesAreInSync(rejuvenatedParticles));

            var p = _.partition(rejuvenatedParticles, function(p) { return p.trace.isComplete(); });
            this.completeParticles = p[0];
            this.particles = p[1];
            this.debugLog(p[1].length + ' active particles after resample/rejuv.\n');

            if (this.particles.length > 0) {
              return this.runCurrentParticle();
            } else {
              return this.finish();
            }
          }.bind(this));
        } else {
          // All particles complete.
          this.particles = [];
          this.completeParticles = resampledParticles;
          return this.finish();
        }
      }.bind(this));
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
    this.debugLog('(' + this.particleIndex + ') Exit | Value: ' + val);
    return this.sync();
  };

  SMC.prototype.finish = function(s, val) {
    assert.strictEqual(this.completeParticles.length, this.numParticles);

    var hist = new CountAggregator(this.onlyMAP);
    var traces = [];

    var aggregate = function(trace) {
      var value = this.adRequired ? ad.valueRec(trace.value) : trace.value;
      var score = this.adRequired ? ad.valueRec(trace.score) : trace.score;
      hist.add(value, score);
      if (this.saveTraces) {
        traces.push(trace);
      }
    }.bind(this);

    var logAvgW = _.head(this.completeParticles).logWeight;

    return util.cpsForEach(
        function(particle, i, ps, k) {
          if (this.performFinalRejuv) {
            // Final rejuvenation.
            var chain = kernels.repeat(
                this.rejuvSteps,
                kernels.sequence(
                    this.rejuvKernel,
                    kernels.tap(aggregate)));
            return chain(k, particle.trace);
          } else {
            aggregate(particle.trace);
            return k();
          }
        }.bind(this),
        function() {
          var dist = hist.toDist();
          dist.normalizationConstant = logAvgW;
          if (this.saveTraces) {
            dist.traces = traces;
          }
          env.coroutine = this.oldCoroutine;
          return this.k(this.s, dist);
        }.bind(this),
        this.completeParticles);
  };

  SMC.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  // Restrict rejuvenation to choices that come after proposal boundary.
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

  return {
    SMC: function(s, k, a, wpplFn, options) {
      return new SMC(s, k, a, wpplFn, options).run();
    },
    setProposalBoundary: setProposalBoundary
  };

};
