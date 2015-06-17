////////////////////////////////////////////////////////////////////
// Particle filter with lightweight MH rejuvenation.
//
// Sequential importance re-sampling, which treats 'factor' calls as
// the synchronization / intermediate distribution points.
// After each factor particles are rejuvenated via lightweight MH.
//
// If numParticles==1 this amounts to MH with an (expensive) annealed init (but only returning one sample),
// if rejuvSteps==0 this is a plain PF without any MH.

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');


module.exports = function(env) {

  var mh = require('./mh.js')(env);

  var deepCopyTrace = function(trace) {
    return trace.map(function(obj) {
      var objCopy = _.clone(obj);
      objCopy.store = _.clone(obj.store);
      return objCopy;
    });
  };

  function ParticleFilterRejuv(s, k, a, wpplFn, numParticles, rejuvSteps) {

    this.particles = [];
    this.particleIndex = 0;  // marks the active particle
    this.rejuvSteps = rejuvSteps;
    this.baseAddress = a;
    this.wpplFn = wpplFn;
    this.isParticleFilterRejuvCoroutine = true;

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = s; // will be reinstated at the end

    // Create initial particles
    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };
    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: exitK,
        weight: 0,
        score: 0,
        value: undefined,
        trace: [],
        store: _.clone(s)
      };
      this.particles.push(particle);
    }

  }

  ParticleFilterRejuv.prototype.run = function() {
    return this.activeParticle().continuation(this.activeParticle().store);
  };

  ParticleFilterRejuv.prototype.sample = function(s, cc, a, erp, params) {

    var val = erp.sample(params);
    var currScore = this.activeParticle().score;
    var choiceScore = erp.score(params, val);
    this.activeParticle().trace.push(
        {
          k: cc, name: a, erp: erp, params: params,
          score: currScore,
          forwardChoiceScore: choiceScore,
          val: val, reused: false,
          store: _.clone(s)
        });
    this.activeParticle().score += choiceScore;
    return cc(s, val);
  };

  ParticleFilterRejuv.prototype.factor = function(s, cc, a, score) {
    // Update particle weight and score
    this.activeParticle().weight += score;
    this.activeParticle().score += score;
    this.activeParticle().continuation = cc;
    this.activeParticle().store = _.clone(s);

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      //rejuvenate each particle via MH
      return util.cpsForEach(
          function(particle, i, particles, nextK) {
            // make sure mhp coroutine doesn't escape:
            assert(env.coroutine.isParticleFilterRejuvCoroutine);
            return new MHP(
                function(p) {
                  particles[i] = p;
                  return nextK();
                },
                particle, this.baseAddress,
                a, this.wpplFn, this.rejuvSteps).run();
          }.bind(this),
          function() {
            this.particleIndex = 0;
            return this.activeParticle().continuation(this.activeParticle().store);
          }.bind(this),
          this.particles
      );
    } else {
      // Advance to the next particle
      this.particleIndex += 1;
      return this.activeParticle().continuation(this.activeParticle().store);
    }
  };

  ParticleFilterRejuv.prototype.activeParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilterRejuv.prototype.allParticlesAdvanced = function() {
    return ((this.particleIndex + 1) === this.particles.length);
  };

  function copyPFRParticle(particle) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      value: particle.value,
      score: particle.score,
      store: _.clone(particle.store),
      trace: deepCopyTrace(particle.trace)
    };
  }

  ParticleFilterRejuv.prototype.resampleParticles = function() {

    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var W = util.logsumexp(_.map(this.particles, function(p) {
      return p.weight;
    }));
    var avgW = W - Math.log(m);

    // Allow -Infinity case (for mh initialization, in particular with few particles)
    if (avgW === -Infinity) {
      console.warn('ParticleFilterRejuv: resampleParticles: all ' + m + ' particles have weight -Inf');
      return;
    }

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
            retainedParticles.push(copyPFRParticle(particle));
          }
        });

    // Compute new particles
    var numNewParticles = m - retainedParticles.length;
    var newParticles = [];
    var j;
    for (var i = 0; i < numNewParticles; i++) {
      j = erp.multinomialSample(newExpWeights);
      newParticles.push(copyPFRParticle(this.particles[j]));
    }

    // Particles after update: Retained + new particles
    this.particles = newParticles.concat(retainedParticles);

    // Reset all weights
    _.each(this.particles, function(particle) {
      particle.weight = avgW;
    });
  };

  ParticleFilterRejuv.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;

    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    if (!this.allParticlesAdvanced()) {
      this.particleIndex += 1;
      return this.activeParticle().continuation(this.activeParticle().store);
    }

    // Initialize histogram with particle values
    var hist = {};
    this.particles.forEach(function(particle) {
      if (hist[particle.value] === undefined) {
        hist[particle.value] = {prob: 0, val: particle.value};
      }
      hist[particle.value].prob += 1;
    });

    // Final rejuvenation (will add values for each MH step to histogram)
    var oldStore = this.oldStore;
    return util.cpsForEach(
        function(particle, i, particles, nextK) {
          // make sure mhp coroutine doesn't escape:
          assert(env.coroutine.isParticleFilterRejuvCoroutine);
          return new MHP(
              function(p) {
                particles[i] = p;
                return nextK();
              },
              particle, this.baseAddress, undefined,
              this.wpplFn, this.rejuvSteps, hist).run();
        }.bind(this),
        function() {
          var dist = erp.makeMarginalERP(hist);

          // Save estimated normalization constant in erp (average particle weight)
          dist.normalizationConstant = this.particles[0].weight;

          // Reinstate previous coroutine:
          var k = this.k;
          env.coroutine = this.oldCoroutine;

          // Return from particle filter by calling original continuation:
          return k(oldStore, dist);
        }.bind(this),
        this.particles
    );

  };

  ParticleFilterRejuv.prototype.incrementalize = env.defaultCoroutine.incrementalize;


  ////// Lightweight MH on a particle

  function MHP(backToPF, particle, baseAddress, limitAddress, wpplFn, numIterations, hist) {
    this.oldStore = particle.store; // previous store at limitAddress
    this.trace = particle.trace;
    this.oldTrace = undefined;
    this.currScore = particle.score;
    this.oldScore = undefined;
    this.val = particle.value;
    this.regenFrom = undefined;
    this.backToPF = backToPF;
    this.iterations = numIterations;
    this.limitAddress = limitAddress;
    this.originalParticle = particle;
    this.hist = hist;

    // Move PF coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  MHP.prototype.run = function() {
    if (this.iterations === 0) {
      env.coroutine = this.oldCoroutine;
      return this.backToPF(this.originalParticle);
    } else {
      return this.propose(); //FIXME: on final exit, will this end up calling the MH exit correctly?
    }
  };

  MHP.prototype.factor = function(s, k, a, sc) {
    this.currScore += sc;
    if (a === this.limitAddress) { //we need to exit if we've reached the fathest point of this particle...
      return env.exit(s);
    } else {
      return k(s);
    }
  };

  MHP.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    return mh.mhSample(this, arguments);
  };

  MHP.prototype.propose = function() {
    //make a new proposal:
    this.regenFrom = Math.floor(Math.random() * this.trace.length);
    var regen = this.trace[this.regenFrom];
    this.oldTrace = deepCopyTrace(this.trace);
    this.trace = this.trace.slice(0, this.regenFrom);
    this.oldScore = this.currScore;
    this.currScore = regen.score;
    this.oldVal = this.val;

    return this.sample(_.clone(regen.store), regen.k, regen.name, regen.erp, regen.params, true);
  };


  MHP.prototype.exit = function(s, val) {

    this.val = val;

    // Did we like this proposal?
    var acceptance = mh.acceptProb(
        this.trace,
        this.oldTrace,
        this.regenFrom,
        this.currScore,
        this.oldScore);

    var accepted = Math.random() < acceptance;

    if (accepted) {
      this.oldStore = s;
    } else {
      // If rejected, roll back trace, etc:
      this.trace = this.oldTrace;
      this.currScore = this.oldScore;
      this.val = this.oldVal;
    }

    // If this is the final rejuvenation run, build hist from
    // all MCMC steps, not just final step
    if (this.hist !== undefined) {
      // Compute marginal distribution from (unweighted) particles
      var k = JSON.stringify(this.val);
      if (this.hist[k] === undefined) {
        this.hist[k] = {prob: 0, val: this.val};
      }
      this.hist[k].prob += 1;
    }

    this.iterations -= 1;

    if (this.iterations > 0) {
      return this.propose();
    } else {
      var newParticle = {
        continuation: this.originalParticle.continuation,
        weight: this.originalParticle.weight,
        value: this.val,
        score: this.currScore,
        store: this.oldStore, // use store from latest accepted proposal
        trace: this.trace
      };

      // Reinstate previous coroutine and return by calling original continuation:
      env.coroutine = this.oldCoroutine;
      return this.backToPF(newParticle);
    }
  };

  // TODO: Incrementalized version?
  MHP.prototype.incrementalize = env.defaultCoroutine.incrementalize;


  function pfr(s, cc, a, wpplFn, numParticles, rejuvSteps) {
    return new ParticleFilterRejuv(s, cc, a, wpplFn, numParticles, rejuvSteps).run();
  }

  return {
    ParticleFilterRejuv: pfr
  };

};
