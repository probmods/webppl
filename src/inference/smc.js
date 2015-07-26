////////////////////////////////////////////////////////////////////
// Particle filter with lightweight MH rejuvenation.
//
// Sequential importance re-sampling, which treats 'factor' calls as
// the synchronization / intermediate distribution points.
// After each factor particles are rejuvenated via lightweight MH.
//
// If numParticles==1 this amounts to MH with an (expensive) annealed init
// if rejuvSteps==0 this is a plain PF without any MH.

'use strict';

var _ = require('underscore');
var assert = require('assert');
var util = require('../util.js');
var erp = require('../erp.js');

function isActive(particle) {
  return particle.active;
}

module.exports = function(env) {

  var mh = require('./mh.js')(env);

  function deepCopyTrace(trace) {
    return trace.map(function(obj) {
      var objCopy = _.clone(obj);
      objCopy.store = _.clone(obj.store);
      return objCopy;
    });
  }

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
        store: _.clone(s),
        active: true,
        proposalBoundary: 0 // index of first erp to consider for mh proposals
      };
      this.particles.push(particle);
    }
  }

  ParticleFilterRejuv.prototype.run = function() {
    return this.currentParticle().continuation(this.currentParticle().store);
  };

  ParticleFilterRejuv.prototype.sample = function(s, cc, a, erp, params) {
    var importanceERP = erp.importanceERP || erp;
    var val = importanceERP.sample(params);
    var importanceScore = importanceERP.score(params, val);
    var choiceScore = erp.score(params, val);
    var currScore = this.currentParticle().score;
    this.currentParticle().trace.push(
        {k: cc, name: a, erp: erp, params: params,
          score: currScore, forwardChoiceScore: importanceScore,
          val: val, reused: false, store: _.clone(s)});
    this.currentParticle().score += choiceScore;
    this.currentParticle().weight += choiceScore - importanceScore;
    return cc(s, val);
  };

  ParticleFilterRejuv.prototype.factor = function(s, cc, a, score) {
    // Update particle weight and score
    this.currentParticle().weight += score;
    this.currentParticle().score += score;
    this.currentParticle().continuation = cc;
    this.currentParticle().store = _.clone(s);

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      //rejuvenate each particle via MH
      return util.cpsForEach(
          function(particle, i, particles, nextK) {
            // make sure mhp coroutine doesn't escape:
            assert(env.coroutine.isParticleFilterRejuvCoroutine);
            // if particle has finished, don't rejuvenate
            if (!particle.active) return nextK();
            // otherwise, rejuvenate
            return new MHP(function(p) {particles[i] = p; return nextK();},
                           particle, this.baseAddress, a,
                           this.wpplFn, this.rejuvSteps).run();
          }.bind(this),
          function() {
            // Resampling can kill all continuing particles
            var i = this.firstActiveParticleIndex();
            if (i === -1)
              return this.finish(); // All particles completed
            else
              this.particleIndex = i;
            return this.currentParticle().continuation(this.currentParticle().store);
          }.bind(this),
          this.particles
      );
    } else {
      // Advance to the next particle
      this.particleIndex = this.nextActiveParticleIndex();
      return this.currentParticle().continuation(this.currentParticle().store);
    }
  };

  // The three functions below return -1 if there is no active particle

  ParticleFilterRejuv.prototype.firstActiveParticleIndex = function() {
    return util.indexOfPred(this.particles, isActive);
  };

  ParticleFilterRejuv.prototype.lastActiveParticleIndex = function() {
    return util.lastIndexOfPred(this.particles, isActive);
  };

  ParticleFilterRejuv.prototype.nextActiveParticleIndex = function() {
    var successorIndex = this.particleIndex + 1;
    var nextActiveIndex = util.indexOfPred(this.particles, isActive, successorIndex);
    if (nextActiveIndex === -1)
      return this.firstActiveParticleIndex();  // wrap around
    else
      return nextActiveIndex;
  };

  ParticleFilterRejuv.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilterRejuv.prototype.allParticlesAdvanced = function() {
    return this.particleIndex === this.lastActiveParticleIndex();
  };

  function copyPFRParticle(particle) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      value: particle.value,
      score: particle.score,
      store: _.clone(particle.store),
      active: particle.active,
      trace: deepCopyTrace(particle.trace),
      proposalBoundary: particle.proposalBoundary
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
    this.currentParticle().value = retval;
    this.currentParticle().active = false;
    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    var i = this.nextActiveParticleIndex();
    if (i === -1) {
      return this.finish();     // All particles completed
    } else {
      if (i < this.particleIndex)
        this.resampleParticles(); // Updated all particles; now wrap around
      this.particleIndex = i;
      return this.currentParticle().continuation(this.currentParticle().store);
    }
  };

  ParticleFilterRejuv.prototype.finish = function() {
    // Initialize histogram with particle values
    var hist = {};
    this.particles.forEach(function(particle) {
      var s = JSON.stringify(particle.value);
      if (hist[s] === undefined) {
        hist[s] = {prob: 0, val: particle.value};
      }
      hist[s].prob += 1;
    });

    // Final rejuvenation (will add values for each MH step to histogram)
    var oldStore = this.oldStore;
    return util.cpsForEach(
        function(particle, i, particles, nextK) {
          // no need to check for inactive particles here
          // make sure mhp coroutine doesn't escape:
          assert(env.coroutine.isParticleFilterRejuvCoroutine);
          return new MHP(function(p) {particles[i] = p; return nextK();},
                         particle, this.baseAddress, undefined,
                         this.wpplFn, this.rejuvSteps, hist).run();
        }.bind(this),
        function() {
          var dist = erp.makeMarginalERP(util.logHist(hist));

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
    this.proposalBoundary = particle.proposalBoundary;

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
    this.regenFrom = this.proposalBoundary + Math.floor(Math.random() * (this.trace.length - this.proposalBoundary));
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
        this.oldScore,
        this.proposalBoundary);

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
        active: this.originalParticle.active,
        trace: this.trace,
        proposalBoundary: this.originalParticle.proposalBoundary
      };

      // Reinstate previous coroutine and return by calling original continuation:
      env.coroutine = this.oldCoroutine;
      return this.backToPF(newParticle);
    }
  };

  // TODO: Incrementalized version?
  MHP.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  // Restrict rejuvenation to erps that come after proposal boundary
  function setProposalBoundary(s, k, a) {
    if (env.coroutine.isParticleFilterRejuvCoroutine) {
      var particle = env.coroutine.currentParticle();
      particle.proposalBoundary = particle.trace.length;
    }
    return k(s);
  }

  function pfr(s, cc, a, wpplFn, numParticles, rejuvSteps) {
    return new ParticleFilterRejuv(s, cc, a, wpplFn, numParticles, rejuvSteps).run();
  }

  return {
    ParticleFilterRejuv: pfr,
    setProposalBoundary: setProposalBoundary
  };

};
