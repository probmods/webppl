////////////////////////////////////////////////////////////////////
// Particle filter with HMC rejuvenation.
//
// Sequential importance re-sampling, which treats 'factor' calls as
// the synchronization / intermediate distribution points.
// After each factor particles are rejuvenated via HMC.
//
// If numParticles==1 this amounts to HMC with an (expensive) annealed init
// if rejuvSteps==0 this is a plain PF without any HMC.

'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');
var util = require('../util.js');
var getOpt = util.getOpt;

var ad = require('ad.js')({mode: 'r'})
var initParticle = require('../trace').initParticle;

function isActive(p) {return p.active}

module.exports = function(env) {
  // HMC on a particle

  var _HMC = require('./hmc.js')(env)._HMC;
  // `finish` just needs current trace and last value to update particle
  _HMC.prototype.finish = function() {
    env.coroutine = this.oldCoroutine; // restore prev coroutine
    return this.k(this.s, {trace: this.trace, value: this.currentValue});
  }

  var _hmc = function(s, k, a, wpplFn, kernelOpts, particle, limitAddress, hist) {
    if (kernelOpts.steps === 0)         // if no rejuvenation
      return k(s, {trace: particle.trace.clone(ad.add), value: particle.value});

    var hmc = new _HMC(s, k, a, wpplFn, kernelOpts);
    // modify `factor` to exit at intended limit
    hmc.factor = function(s, k, a, score) {
      return (a === limitAddress) ?
          this.exit(s, undefined) : // reached limit; exit
          _HMC.prototype.factor.bind(this)(s, k, a, score); // use intended factor
    }
    if (hist === undefined)       // noop when hist not available
      hmc.updateHist = function(val) {return undefined};
    else                        // use given hist when available
      hmc.hist = hist;

    hmc.trace = particle.trace.clone(ad.add); // init with pre-built trace
    // return hmc.exit(particle.store, particle.value);
    return hmc.propose();
  }

  // SMC with HMC

  function HSMC(s, k, a, wpplFn, opts) {
    this.numParticles = getOpt(opts, 'numParticles', 100);
    this.kernelOpts = getOpt(opts,
                             'kernelOpts',
                             {stepSize: 0.1,
                              steps: 5,
                              iterations: 1000,
                              proposers: ['leapfrog', 'mh'],
                              aggregator: 'score',
                              verbosity: 0});
    this.aggregator = getOpt(opts, 'aggregator', 'count');

    var exitK = function(s) {return wpplFn(s, env.exit, a);};
    this.isHSMCCoroutine = true;
    this.particles = _.times(this.numParticles,
                             function() {return initParticle(_.clone(s), exitK, ad.add)});
    this.particleIndex = 0;
    this.baseAddress = a;
    this.wpplFn = wpplFn;
    this.hist = {};

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
    var _value = erp.sample(ad.untapify(params));
    var value = erp.isContinuous() ? ad.tapify(_value) : _value;
    var score = erp.score(params, value);
    this.currentParticle().update(_.clone(s), cc, a, erp, params, score, 0, value);
    return cc(s, value);
  };

  HSMC.prototype.factor = function(s, cc, a, score) {
    // Update particle weight and score
    this.currentParticle().update(_.clone(s), cc, a, null, null, score, ad.untapify(score), null);

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      // rejuvenate each particle via MH
      return util.cpsForEach(
          function(particle, i, particles, nextK) {
            // make sure mhp coroutine doesn't escape:
            assert(env.coroutine.isHSMCCoroutine);
            // if particle has finished, don't rejuvenate
            if (!particle.active) return nextK();
            // otherwise, rejuvenate
            return _hmc(this.oldStore,
                        function(s, ret) {
                          particles[i].trace = ret.trace; // update rejuvenated trace
                          particles[i].value = ret.value;
                          return nextK();
                        },
                        this.a,
                        this.wpplFn,
                        this.kernelOpts,
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

  HSMC.prototype.updateHist = function (value, score) {
    var s = JSON.stringify(ad.untapify(value));
    if (this.aggregator === 'score') {
      if (this.hist[s] === undefined)
        this.hist[s] = {prob: -Infinity, val: value};
      this.hist[s].prob = util.logsumexp([this.hist[s].prob,
                                          ad.untapify(score)]);
    } else {                    // aggregator = 'count'
      if (this.hist[s] === undefined)
        this.hist[s] = {prob: 0, val: value};
      this.hist[s].prob += 1;
    }
  };

  HSMC.prototype.finish = function() {
    // Initialize histogram with particle values
    var cc = this;
    this.particles.forEach(function(particle) {
      cc.updateHist(particle.value, particle.score());
    });

    // Final rejuvenation (will add values for each MH step to histogram)
    var oldStore = this.oldStore;
    return util.cpsForEach(
        function(particle, i, particles, nextK) {
          // make sure mhp coroutine doesn't escape:
          assert(env.coroutine.isHSMCCoroutine);
          // no need to check for inactive particles here
          return _hmc(this.oldStore,
                      function(s, ret) {
                        particles[i].trace = ret.trace; // update rejuvenated trace
                        particles[i].value = ret.value;
                        return nextK();
                      },
                      this.a,
                      this.wpplFn,
                      this.kernelOpts,
                      particle,
                      null,
                      this.hist);
        }.bind(this),
        function() {
          var hist = this.aggregator === 'score' ? this.hist : util.logHist(this.hist);
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

  HSMC.prototype.incrementalize = env.defaultCoroutine.incrementalize;

  function hsmc(s, cc, a, wpplFn, opts) {
    return new HSMC(s, cc, a, wpplFn, opts).run();
  }

  return {
    HSMC: hsmc
  };

};
