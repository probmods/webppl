'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');

// This is a stripped down particle filer. Is doesn't handle variable numbers of
// factors and uses a basic resampling strategy.

module.exports = function(env) {

  var MHKernel = require('./mhkernel')(env).MHKernel;

  function ParticleFilter(s, k, a, wpplFn, numParticles, rejuvSteps) {

    this.particles = [];
    this.particleIndex = 0;
    this.numParticles = numParticles;
    this.rejuvSteps = rejuvSteps;

    this.hist = {};

    // Create initial particles/
    var exitK = function(s) {
      return wpplFn(s, env.exit, a);
    };

    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: exitK,
        weight: 0,
        store: _.clone(s),
        trace: [],
        score: 0
      };
      this.particles.push(particle);
    }
    this.a = a;
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = s;
  }

  ParticleFilter.prototype.run = function() {
    return this.runCurrentParticle();
  };

  ParticleFilter.prototype.sample = function(s, k, a, erp, params) {
    var val = erp.sample(params);
    var choiceScore = erp.score(params, val);
    var particle = this.currentParticle();
    particle.trace.push({
      k: k,
      name: a,
      erp: erp,
      params: params,
      score: particle.score,
      choiceScore: choiceScore,
      val: val,
      s: _.clone(s)
    });
    particle.score += choiceScore;
    return k(s, val);
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle.
    var p = this.currentParticle();
    p.continuation = cc;
    p.weight = score;
    p.store = s;
    p.score += score;

    // We're maintaining partial traces, for which score and continuation are
    // expected to be present.
    p.trace.score = p.score;
    p.trace.k = p.continuation;

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
    // TODO: Extract copy trace function.
    // TODO: Is a shallow copy sufficient? (What happens in smc.js?)
    var t = _.clone(particle.trace);
    t.score = particle.trace.score;
    t.val = particle.trace.val;
    t.k = particle.trace.k;

    return {
      continuation: particle.continuation,
      weight: 0,
      value: particle.value,
      store: _.clone(particle.store),
      trace: t,
      score: particle.score
    };
  }

  ParticleFilter.prototype.resampleParticles = function() {
    var ws = _.map(this.particles, function(p) { return Math.exp(p.weight); });
    var wsum = util.sum(ws);
    var wsnorm = _.map(ws, function(w) { return w / wsum; });

    assert(_.some(wsnorm, function(w) { return w > 0; }), 'No +ve weights: ' + ws);
    assert(_.every(wsnorm, function(w) { return w >= 0; }));

    this.particles = _.chain(_.range(this.numParticles))
      .map(function() {
          var ix = choose(wsnorm);
          assert(ix >= 0 && ix < this.numParticles);
          return copyParticle(this.particles[ix]);
        }.bind(this)).value()
  };

  // TODO: How can this be written in a more straight-foward way.

  // TODO: k here isn't a webppl continuation, rather it's a thunk, created in
  // factor. This doesn't need to be called with arguments and I don't think I
  // need to pass s & a around either.

  ParticleFilter.prototype.rejuvenateParticles = function(cont, exitAddress) {
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
    var transition = _.partial(MHKernel, this.s, _, this.a, this.wpplFn, _, exitAddress);

    var particle = this.particles[i];
    var trace = particle.trace;

    // TODO: This is similar to MCMC. Extract?

    return util.cpsLoop(this.rejuvSteps,
        function(j, next) {
          //console.log('Step: ' + j);
          return transition(function(s, newTrace) {
            trace = newTrace;
            return next();
          }, trace);
        },
        function() {
          // TODO: Investigate whether these can be kept on the trace only.
          particle.trace = trace;
          particle.score = trace.score;
          particle.continuation = trace.k;
          return cont();
        }
    );
  };

  ParticleFilter.prototype.exit = function(s, val) {
    // Complete the trace.
    var particle = this.currentParticle();
    particle.trace.val = val;
    particle.trace.score = particle.score;

    //console.log(particle.trace);

    // Update histogram.
    var k = JSON.stringify(val);
    if (this.hist[k] === undefined) this.hist[k] = { prob: 0, val: val };
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
    ParticleFilter2: function(s, cc, a, wpplFn, numParticles, rejuvSteps) {
      return new ParticleFilter(s, cc, a, wpplFn, numParticles, rejuvSteps).run();
    }
  };

};
