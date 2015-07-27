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

var ad = require('ad.js')({mode: 'r'})
var initParticle = require('../trace').initParticle;

function isActive(p) {return p.active}

module.exports = function(env) {

  // HMC on a particle

  var _HMC = require('./hmc.js')(env)._HMC;
  // `finish` just needs current trace to update particle
  _HMC.prototype.finish = function() {
    env.coroutine = this.oldCoroutine; // restore prev coroutine
    return this.k(this.s, this.trace);
  }

  var _hmc = function(s, k, a, wpplFn, rejuvSteps, particle, limitAddress, hist) {
    if (rejuvSteps === 0)
      return k(s, particle.trace); // if no rejuvenation

    var hmcOpts = {stepSize: 0.1,
                    steps: 5,
                    iterations: rejuvSteps,
                    proposers: ['mh'],
                    verbosity: 0}
    var hmc = new _HMC(s, k, a, wpplFn, hmcOpts);
    // modify `factor` to exit at intended limit
    hmc.factor = function(s, k, a, score) {
      return (a === limitAddress) ?
          this.exit(s, undefined) : // reached limit; exit
          _HMC.prototype.factor.bind(this)(s, k, a, score); // use intended factor
    }
    if (hist === undefined)       // noop update when hist not available
      hmc.updateHist = function(val) {return undefined};
    else                        // use given hist when available
      hmc.hist = hist;

    hmc.trace = particle.trace.clone(ad.add); // init with pre-built trace
    return hmc.propose()
  }

  // SMC with HMC

  function HSMC(s, k, a, wpplFn, numParticles, rejuvSteps) {
    var exitK = function(s) {return wpplFn(s, env.exit, a);};
    this.isHSMCCoroutine = true;
    this.particles = _.times(numParticles, function() {return initParticle(s, exitK, ad.add)});
    this.particleIndex = 0;
    this.rejuvSteps = rejuvSteps;
    this.baseAddress = a;
    this.wpplFn = wpplFn;

    // Save old coroutine and install `this` as current handler.
    this.oldCoroutine = env.coroutine;
    this.k = k;
    this.a = a;
    this.oldStore = s;          // will be reinstated at the end
    env.coroutine = this;
  }

  HSMC.prototype.run = function() {
    return this.currentParticle().resume();
  };

  HSMC.prototype.sample = function(s, cc, a, erp, params) {
    var value = erp.sample(params);
    var score = erp.score(params, value);
    this.currentParticle().update(s, cc, a, erp, params, score, 0, value);
    return cc(s, value);
  };

  HSMC.prototype.factor = function(s, cc, a, score) {
    // Update particle weight and score
    this.currentParticle().update(s, cc, a, null, null, score, score, null);

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      //rejuvenate each particle via MH
      return util.cpsForEach(
          function(particle, i, particles, nextK) {
            // make sure mhp coroutine doesn't escape:
            assert(env.coroutine.isHSMCCoroutine);
            // if particle has finished, don't rejuvenate
            if (!particle.active) return nextK();
            // otherwise, rejuvenate
            return _hmc(s,
                        function(s, trace) {
                          particles[i].trace = trace; // update rejuvenated trace
                          return nextK();
                        },
                        this.a,
                        this.wpplFn,
                        this.rejuvSteps,
                        particle,
                        a);
          }.bind(this),
          function() {
            // Resampling can kill all continuing particles
            var i = this.firstActiveParticleIndex();
            if (i === -1)
              return this.finish(); // All particles completed
            else
              this.particleIndex = i;
            return this.currentParticle().resume();
          }.bind(this),
          this.particles
      );
    } else {
      // Advance to the next particle
      this.particleIndex = this.nextActiveParticleIndex();
      return this.currentParticle().resume();
    }
  };

  // The three functions below return -1 if there is no active particle

  HSMC.prototype.firstActiveParticleIndex = function() {
    return util.indexOfPred(this.particles, isActive);
  };

  HSMC.prototype.lastActiveParticleIndex = function() {
    return util.lastIndexOfPred(this.particles, isActive);
  };

  HSMC.prototype.nextActiveParticleIndex = function() {
    var successorIndex = this.particleIndex + 1;
    var nextActiveIndex = util.indexOfPred(this.particles, isActive, successorIndex);
    if (nextActiveIndex === -1)
      return this.firstActiveParticleIndex();  // wrap around
    else
      return nextActiveIndex;
  };

  HSMC.prototype.currentParticle = function() {
    return this.particles[this.particleIndex];
  };

  HSMC.prototype.allParticlesAdvanced = function() {
    return this.particleIndex === this.lastActiveParticleIndex();
  };

  HSMC.prototype.resampleParticles = function() {
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var W = util.logsumexp(_.map(this.particles, function(p) {
      return p.weight;
    }));
    var avgW = W - Math.log(m);
    // Allow -Infinity case (for mh initialization, in particular with few particles)
    if (avgW === -Infinity) {
      console.warn('HSMC: resampleParticles: all ' + m + ' particles have weight -Inf');
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
            retainedParticles.push(particle.clone());
          }
        });
    // Compute new particles
    var numNewParticles = m - retainedParticles.length;
    var newParticles = [];
    var j;
    for (var i = 0; i < numNewParticles; i++) {
      j = erp.multinomialSample(newExpWeights);
      newParticles.push(this.particles[j].clone());
    }
    // Particles after update: Retained + new particles
    this.particles = newParticles.concat(retainedParticles);
    // Reset all weights
    _.each(this.particles, function(particle) {
      particle.weight = avgW;
    });
  };

  HSMC.prototype.exit = function(s, retval) {
    this.currentParticle().value = retval;
    this.currentParticle().deactivate();
    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    var i = this.nextActiveParticleIndex();
    if (i === -1) {
      return this.finish();     // All particles completed
    } else {
      if (i < this.particleIndex)
        this.resampleParticles(); // Updated all particles; now wrap around
      this.particleIndex = i;
      return this.currentParticle().resume();
    }
  };

  HSMC.prototype.finish = function() {
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
          // make sure mhp coroutine doesn't escape:
          assert(env.coroutine.isHSMCCoroutine);
          // no need to check for inactive particles here
          return _hmc(particle.store,
                      function(s, trace) {
                        particles[i].trace = trace; // update rejuvenated trace
                        return nextK();
                      },
                      this.a,
                      this.wpplFn,
                      this.rejuvSteps,
                      particle,
                      null,
                      hist);
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

  HSMC.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function hsmc(s, cc, a, wpplFn, numParticles, rejuvSteps) {
    return new HSMC(s, cc, a, wpplFn, numParticles, rejuvSteps).run();
  }

  return {
    HSMC: hsmc
  };

};
