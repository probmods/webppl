'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');

module.exports = function(env) {

  function ParticleFilter(s, k, a, wpplFn, numParticles) {

    this.particles = [];
    this.particleIndex = 0;
    this.numParticles = numParticles;

    this.hist = {};

    // Create initial particles/
    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };

    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: exitK,
        score: 0,
        value: undefined,
        store: _.clone(s)
      };
      this.particles.push(particle);
    }

    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = s;
  }

  ParticleFilter.prototype.run = function() {
    return this.runCurrentParticle();
  };

  ParticleFilter.prototype.sample = function(s, cc, a, erp, params) {
    return cc(s, erp.sample(params));
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle.
    var p = this.currentParticle();
    p.continuation = cc;
    p.score = score;
    p.store = s;

    // Resample at the last particle.
    if (this.lastParticle()) this.resampleParticles();
    this.nextParticle();
    return this.runCurrentParticle();
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
    return this.currentParticle().continuation(this.currentParticle().store);
  };

  var choose = function(ps) {
    // ps is expected to be normalized.
    var x = Math.random();
    var acc = 0;
    for (var i = 0; i < ps.length; i++) {
      acc += ps[i];
      if (x < acc) return i;
    }
    throw 'unreachable';
  };

  function copyParticle(particle) {
    return {
      continuation: particle.continuation,
      score: 0,
      value: particle.value,
      store: _.clone(particle.store)
    };
  }

  ParticleFilter.prototype.resampleParticles = function() {
    var ws = _.map(this.particles, function(p) { return Math.exp(p.score); });
    var wsum = util.sum(ws);
    var wsnorm = _.map(ws, function(w) { return w / wsum; });

    assert(_.some(wsnorm, function(w) { return w > 0; }));
    assert(_.every(wsnorm, function(w) { return w >= 0; }));

    this.particles = _.chain(_.range(this.numParticles))
      .map(function() {
          var ix = choose(wsnorm);
          assert(ix >= 0 && ix < this.numParticles);
          return copyParticle(this.particles[ix]);
        }.bind(this)).value()
  };

  ParticleFilter.prototype.exit = function(s, retval) {

    // Update histogram.
    var k = JSON.stringify(retval);
    if (this.hist[k] === undefined) {
      this.hist[k] = { prob: 0, val: retval };
    }
    this.hist[k].prob += 1;

    // Run any remaining particles.
    if (!this.lastParticle()) {
      this.nextParticle();
      return this.runCurrentParticle();
    }

    // Finished, call original continuation.
    var dist = erp.makeMarginalERP(this.hist);
    env.coroutine = this.oldCoroutine;
    return this.k(this.oldStore, dist);
  };


  return {
    ParticleFilter2: function(s, cc, a, wpplFn, numParticles) {
      return new ParticleFilter(s, cc, a, wpplFn, numParticles).run();
    }
  };

};
