'use strict';

var assert = require('assert');
var _ = require('underscore');
var PriorityQueue = require('priorityqueuejs');
var util = require('./util.js');


module.exports = function(env) {

  var erp = require('./erp.js')(env);


  ////////////////////////////////////////////////////////////////////
  // Inference interface
  //
  // An inference function takes the current continuation and a WebPPL
  // thunk (which itself has been transformed to take a
  // continuation). It does some kind of inference and returns an ERP
  // representing the nromalized marginal distribution on return values.
  //
  // The inference function should install a coroutine object that
  // provides sample, factor, and exit.
  //
  // sample and factor are the co-routine handlers: they get call/cc'ed
  // from the wppl code to handle random stuff.
  //
  // The inference function passes exit to the wppl fn, so that it gets
  // called when the fn is exited, it can call the inference cc when
  // inference is done to contintue the program.


  // This global variable tracks the current coroutine, sample and
  // factor use it to interface with the inference algorithm. Default
  // setting throws an error on factor calls.
  env.coroutine = {
    sample: function(s, cc, a, erp, params) {
      // Sample and keep going
      return cc(s, erp.sample(params));
    },
    factor: function() {
      throw 'factor allowed only inside inference.';
    },
    exit: function(s, r) {
      return r;
    }
  };

  // Functions that call methods of whatever the coroutine is set to
  // when called, we do it like this so that 'this' will be set
  // correctly to the coroutine object.
  function sample(s, k, a, dist, params) {
    return env.coroutine.sample(s, k, a, dist, params);
  }

  function factor(s, k, a, score) {
    assert.ok(!isNaN(score));
    return env.coroutine.factor(s, k, a, score);
  }

  function sampleWithFactor(s, k, a, dist, params, scoreFn) {
    if (typeof env.coroutine.sampleWithFactor === 'function') {
      return env.coroutine.sampleWithFactor(s, k, a, dist, params, scoreFn);
    } else {
      var sampleK = function(s, v) {
        var scoreK = function(s, sc) {
          var factorK = function(s) {
            return k(s, v); };
          return factor(s, factorK, a + 'swf2', sc);};
        return scoreFn(s, scoreK, a + 'swf1', v);};
      return sample(s, sampleK, a, dist, params);
    }
  }

  function exit(s, retval) {
    return env.coroutine.exit(s, retval);
  }



  ////////////////////////////////////////////////////////////////////
  // Enumeration
  //
  // Depth-first enumeration of all the paths through the computation.
  // Q is the queue object to use. It should have enq, deq, and size methods.

  function Enumerate(store, k, a, wpplFn, maxExecutions, Q) {
    this.score = 0; // Used to track the score of the path currently being explored
    this.marginal = {}; // We will accumulate the marginal distribution here
    this.numCompletedExecutions = 0;

    this.store = store; // will be reinstated at the end
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.maxExecutions = maxExecutions || Infinity;
    this.queue = Q; // Queue of states that we have yet to explore

    // Move old coroutine out of the way
    this.coroutine = env.coroutine;

    // install this as the current handler
    env.coroutine = this;
  }

  Enumerate.prototype.run = function() {
    // Run the wppl computation, when the computation returns we want it
    // to call the exit method of this coroutine so we pass that as the
    // continuation.
    return this.wpplFn(this.store, exit, this.a);
  };

  // The queue is a bunch of computation states. each state is a
  // continuation, a value to apply it to, and a score.
  //
  // This function runs the highest priority state in the
  // queue. Currently priority is score, but could be adjusted to give
  // depth-first or breadth-first or some other search strategy

  Enumerate.prototype.nextInQueue = function() {
    var nextState = this.queue.deq();
    this.score = nextState.score;

    return nextState.continuation(nextState.store, nextState.value);
  };

  Enumerate.prototype.sample = function(store, cc, a, dist, params, extraScoreFn) {
    //allows extra factors to be taken into account in making exploration decisions:
    extraScoreFn = extraScoreFn || function(x) {return 0;};

    // Find support of this erp:
    if (!dist.support) {
      console.error(dist, params);
      throw 'Enumerate can only be used with ERPs that have support function.';
    }
    var supp = dist.support(params);

    // Check that support is non-empty
    if (supp.length === 0) {
      console.error(dist, params);
      throw 'Enumerate encountered ERP with empty support!';
    }

    // For each value in support, add the continuation paired with
    // support value and score to queue:
    for (var s in supp) {
      if (supp.hasOwnProperty(s)) {
        var state = {
          continuation: cc,
          value: supp[s],
          score: this.score + dist.score(params, supp[s]) + extraScoreFn(supp[s]),
          store: util.copyObj(store)
        };
        this.queue.enq(state);
      }
    }
    // Call the next state on the queue
    return this.nextInQueue();
  };

  Enumerate.prototype.factor = function(s, cc, a, score) {
    // Update score and continue
    this.score += score;
    return cc(s);
  };

  // FIXME: can only call scoreFn in tail position!
  // Enumerate.prototype.sampleWithFactor = function(s,cc,a,dist,params,scoreFn) {
  //   coroutine.sample(s,cc,a,dist,params,
  //                    function(v){
  //                      var ret;
  //                      scoreFn(s, function(s, x){ret = x;}, a+"swf", v);
  //                      return ret;});
  // };


  Enumerate.prototype.exit = function(s, retval) {
    // We have reached an exit of the computation. Accumulate probability into retval bin.
    var r = JSON.stringify(retval);
    if (this.score !== -Infinity) {
      if (this.marginal[r] === undefined) {
        this.marginal[r] = {prob: 0, val: retval};
      }
      this.marginal[r].prob += Math.exp(this.score);
    }

    // Increment the completed execution counter
    this.numCompletedExecutions++;

    // If anything is left in queue do it:
    if (this.queue.size() > 0 && (this.numCompletedExecutions < this.maxExecutions)) {
      return this.nextInQueue();
    } else {
      var marginal = this.marginal;
      var dist = erp.makeMarginalERP(marginal);
      // Reinstate previous coroutine:
      env.coroutine = this.coroutine;
      // Return from enumeration by calling original continuation with original store:
      return this.k(this.store, dist);
    }
  };

  //helper wraps with 'new' to make a new copy of Enumerate and set 'this' correctly..
  function enuPriority(s, cc, a, wpplFn, maxExecutions) {
    var q = new PriorityQueue(function(a, b) {return a.score - b.score;});
    return new Enumerate(s, cc, a, wpplFn, maxExecutions, q).run();
  }

  function enuFilo(s, cc, a, wpplFn, maxExecutions) {
    var q = [];
    q.size = function() {return q.length;};
    q.enq = q.push;
    q.deq = q.pop;
    return new Enumerate(s, cc, a, wpplFn, maxExecutions, q).run();
  }

  function enuFifo(s, cc, a, wpplFn, maxExecutions) {
    var q = [];
    q.size = function() {return q.length;};
    q.enq = q.push;
    q.deq = q.shift;
    return new Enumerate(s, cc, a, wpplFn, maxExecutions, q).run();
  }


  ////////////////////////////////////////////////////////////////////
  // Particle filtering
  //
  // Sequential importance re-sampling, which treats 'factor' calls as
  // the synchronization / intermediate distribution points.

  function copyParticle(particle) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      value: particle.value,
      store: util.copyObj(particle.store)
    };
  }

  function ParticleFilter(s, k, a, wpplFn, numParticles, strict) {

    this.particles = [];
    this.particleIndex = 0;  // marks the active particle

    // Create initial particles
    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: function(s) { return wpplFn(s, exit, a);},
        weight: 0,
        value: undefined,
        store: util.copyObj(s)
      };
      this.particles.push(particle);
    }

    this.strict = strict;
    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.oldStore = util.copyObj(s); // will be reinstated at the end
  }

  ParticleFilter.prototype.run = function() {
    // Run first particle
    return this.activeParticle().continuation(this.activeParticle().store);
  };

  ParticleFilter.prototype.sample = function(s, cc, a, erp, params) {
    return cc(s, erp.sample(params));
  };

  ParticleFilter.prototype.factor = function(s, cc, a, score) {
    // Update particle weight
    this.activeParticle().weight += score;
    this.activeParticle().continuation = cc;
    this.activeParticle().store = s;

    if (this.allParticlesAdvanced()) {
      // Resample in proportion to weights
      this.resampleParticles();
      this.particleIndex = 0;
    } else {
      // Advance to the next particle
      this.particleIndex += 1;
    }

    return this.activeParticle().continuation(this.activeParticle().store);
  };

  ParticleFilter.prototype.activeParticle = function() {
    return this.particles[this.particleIndex];
  };

  ParticleFilter.prototype.allParticlesAdvanced = function() {
    return ((this.particleIndex + 1) === this.particles.length);
  };

  ParticleFilter.prototype.resampleParticles = function() {
    // Residual resampling following Liu 2008; p. 72, section 3.4.4
    var m = this.particles.length;
    var W = util.logsumexp(_.map(this.particles, function(p) {return p.weight;}));
    var avgW = W - Math.log(m);

    if (avgW == -Infinity) {      // debugging: check if NaN
      if (this.strict) {
        throw 'Error! All particles -Infinity';
      }
    } else {
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
              retainedParticles.push(copyParticle(particle));
            }});
      // Compute new particles
      var numNewParticles = m - retainedParticles.length;
      var newParticles = [];
      var j;
      for (var i = 0; i < numNewParticles; i++) {
        j = multinomialSample(newExpWeights);
        newParticles.push(copyParticle(this.particles[j]));
      }

      // Particles after update: Retained + new particles
      this.particles = newParticles.concat(retainedParticles);
    }

    // Reset all weights
    _.each(this.particles, function(particle) {particle.weight = avgW;});
  };

  ParticleFilter.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;

    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    if (!this.allParticlesAdvanced()) {
      this.particleIndex += 1;
      return this.activeParticle().continuation(this.activeParticle().store);
    }

    // Compute marginal distribution from (unweighted) particles
    var hist = {};
    _.each(
        this.particles,
        function(particle) {
          var k = JSON.stringify(particle.value);
          if (hist[k] === undefined) {
            hist[k] = { prob: 0, val: particle.value };
          }
          hist[k].prob += 1;
        });
    var dist = erp.makeMarginalERP(hist);

    // Save estimated normalization constant in erp (average particle weight)
    dist.normalizationConstant = this.particles[0].weight;

    // Reinstate previous coroutine:
    env.coroutine = this.oldCoroutine;

    // Return from particle filter by calling original continuation:
    return this.k(this.oldStore, dist);
  };

  function pf(s, cc, a, wpplFn, numParticles, strict) {
    return new ParticleFilter(s, cc, a, wpplFn, numParticles, strict == undefined ? true : strict).run();
  }

  ////////////////////////////////////////////////////////////////////
  // Lightweight MH

  function MH(s, k, a, wpplFn, numIterations) {

    this.trace = [];
    this.oldTrace = undefined;
    this.currScore = 0;
    this.oldScore = -Infinity;
    this.oldVal = undefined;
    this.regenFrom = 0;
    this.returnHist = {};
    this.k = k;
    this.oldStore = s;
    this.iterations = numIterations;

    // Move old coroutine out of the way and install this as the current
    // handler.

    this.wpplFn = wpplFn;
    this.s = s;
    this.a = a;

    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  MH.prototype.run = function() {
    return this.wpplFn(this.s, exit, this.a);
  };

  MH.prototype.factor = function(s, k, a, score) {
    this.currScore += score;
    return k(s);
  };

  MH.prototype.sample = function(s, cont, name, erp, params, forceSample) {
    var prev = findChoice(this.oldTrace, name);

    var reuse = ! (prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    var choiceScore = erp.score(params, val);
    this.trace.push({k: cont, name: name, erp: erp, params: params,
      score: this.currScore, choiceScore: choiceScore,
      val: val, reused: reuse, store: _.clone(s)});
    this.currScore += choiceScore;
    return cont(s, val);
  };

  function findChoice(trace, name) {
    if (trace === undefined) {
      return undefined;
    }
    for (var i = 0; i < trace.length; i++) {
      if (trace[i].name === name) {
        return trace[i];
      }
    }
    return undefined;
  }

  function mhAcceptProb(trace, oldTrace, regenFrom, currScore, oldScore) {
    if ((oldTrace === undefined) || oldScore === -Infinity) {return 1;} // init
    var fw = -Math.log(oldTrace.length);
    trace.slice(regenFrom).map(function(s) {fw += s.reused ? 0 : s.choiceScore;});
    var bw = -Math.log(trace.length);
    oldTrace.slice(regenFrom).map(function(s) {
      var nc = findChoice(trace, s.name);
      bw += (!nc || !nc.reused) ? s.choiceScore : 0; });
    var p = Math.exp(currScore - oldScore + bw - fw);
    assert.ok(!isNaN(p));
    var acceptance = Math.min(1, p);
    return acceptance;
  }

  MH.prototype.exit = function(s, val) {
    if (this.iterations > 0) {
      this.iterations -= 1;

      //did we like this proposal?
      var acceptance = mhAcceptProb(this.trace, this.oldTrace,
                                    this.regenFrom, this.currScore, this.oldScore);
      if (Math.random() >= acceptance) {
        // if rejected, roll back trace, etc:
        this.trace = this.oldTrace;
        this.currScore = this.oldScore;
        val = this.oldVal;
      }

      // now add val to hist:
      var stringifiedVal = JSON.stringify(val);
      if (this.returnHist[stringifiedVal] === undefined) {
        this.returnHist[stringifiedVal] = { prob: 0, val: val };
      }
      this.returnHist[stringifiedVal].prob += 1;

      // make a new proposal:
      this.regenFrom = Math.floor(Math.random() * this.trace.length);
      var regen = this.trace[this.regenFrom];
      this.oldTrace = this.trace;
      this.trace = this.trace.slice(0, this.regenFrom);
      this.oldScore = this.currScore;
      this.currScore = regen.score;
      this.oldVal = val;

      return this.sample(_.clone(regen.store), regen.k, regen.name, regen.erp, regen.params, true);
    } else {
      var dist = erp.makeMarginalERP(this.returnHist);

      // Reinstate previous coroutine:
      var k = this.k;
      env.coroutine = this.oldCoroutine;

      // Return by calling original continuation:
      return k(this.oldStore, dist);
    }
  };

  function mh(s, cc, a, wpplFn, numParticles) {
    return new MH(s, cc, a, wpplFn, numParticles).run();
  }


  ////////////////////////////////////////////////////////////////////
  // PMCMC

  function last(xs) {
    return xs[xs.length - 1];
  }

  function PMCMC(s, cc, a, wpplFn, numParticles, numSweeps) {

    // Move old coroutine out of the way and install this as the
    // current handler.
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    // Store continuation (will be passed dist at the end)
    this.k = cc;

    this.oldStore = s;

    // Setup inference variables
    this.particleIndex = 0;  // marks the active particle
    this.retainedParticle = undefined;
    this.numSweeps = numSweeps;
    this.sweep = 0;
    this.wpplFn = wpplFn;
    this.address = a;
    this.numParticles = numParticles;
    this.resetParticles();
    this.returnHist = {};
  }

  PMCMC.prototype.run = function() {
    // Run first particle
    return this.activeContinuationWithStore();
  };

  PMCMC.prototype.resetParticles = function() {
    var that = this;
    this.particles = [];
    // Create initial particles
    for (var i = 0; i < this.numParticles; i++) {
      var particle = {
        continuations: [function(s) {return that.wpplFn(s, exit, that.address);}],
        stores: [that.oldStore],
        weights: [0],
        value: undefined
      };
      this.particles.push(util.copyObj(particle));
    }
  };

  PMCMC.prototype.activeParticle = function() {
    return this.particles[this.particleIndex];
  };

  PMCMC.prototype.activeContinuation = function() {
    return last(this.activeParticle().continuations);
  };

  PMCMC.prototype.activeContinuationWithStore = function() {
    var k = last(this.activeParticle().continuations);
    var s = _.clone(last(this.activeParticle().stores)); // FIXME: why is cloning here necessary?
    return function() { return k(s);};
  };

  PMCMC.prototype.allParticlesAdvanced = function() {
    return ((this.particleIndex + 1) === this.particles.length);
  };

  PMCMC.prototype.sample = function(s, cc, a, erp, params) {
    return cc(s, erp.sample(params));
  };

  PMCMC.prototype.particleAtStep = function(particle, step) {
    // Returns particle s.t. particle.continuations[step] is the last entry
    return {
      continuations: particle.continuations.slice(0, step + 1),
      stores: particle.stores.slice(0, step + 1),
      weights: particle.weights.slice(0, step + 1),
      value: particle.value
    };
  };

  PMCMC.prototype.updateActiveParticle = function(weight, continuation, store) {
    var particle = this.activeParticle();
    particle.continuations = particle.continuations.concat([continuation]);
    particle.stores = particle.stores.concat([_.clone(store)]);
    particle.weights = particle.weights.concat([weight]);
  };

  PMCMC.prototype.copyParticle = function(particle) {
    return {
      continuations: particle.continuations.slice(0),
      weights: particle.weights.slice(0),
      value: particle.value,
      stores: particle.stores.map(_.clone)
    };
  };

  PMCMC.prototype.resampleParticles = function(particles) {
    var weights = particles.map(
        function(particle) {return Math.exp(last(particle.weights));});

    var j;
    var newParticles = [];
    for (var i = 0; i < particles.length; i++) {
      j = multinomialSample(weights);
      newParticles.push(this.copyParticle(particles[j]));
    }

    return newParticles;
  };

  PMCMC.prototype.factor = function(s, cc, a, score) {

    this.updateActiveParticle(score, cc, s);

    if (this.allParticlesAdvanced()) {
      if (this.sweep > 0) {
        // This is not the first sweep, so we have a retained particle;
        // take that into account when resampling
        var particles = this.particles;
        var step = this.particles[0].continuations.length - 1;
        particles = particles.concat(this.particleAtStep(this.retainedParticle, step));
        this.particles = this.resampleParticles(particles).slice(1);
      } else {
        // No retained particle - standard particle filtering
        this.particles = this.resampleParticles(this.particles);
      }
      this.particleIndex = 0;
    } else {
      // Move next particle along
      this.particleIndex += 1;
    }

    return this.activeContinuationWithStore();
  };

  PMCMC.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;

    if (!this.allParticlesAdvanced()) {

      // Wait for all particles to reach exit
      this.particleIndex += 1;
      return this.activeContinuationWithStore();

    } else {

      // Use all (unweighted) particles from the conditional SMC
      // iteration to estimate marginal distribution.
      if (this.sweep > 0) {
        this.particles.concat(this.retainedParticle).forEach(
            function(particle) {
              var k = JSON.stringify(particle.value);
              if (this.returnHist[k] === undefined) {
                this.returnHist[k] = { prob: 0, val: particle.value };
              }
              this.returnHist[k].prob += 1;
            }.bind(this));
      }

      // Retain the first particle sampled after the final factor statement.
      this.retainedParticle = this.particles[0];

      if (this.sweep < this.numSweeps) {

        // Reset non-retained particles, restart
        this.sweep += 1;
        this.particleIndex = 0;
        this.resetParticles();
        return this.activeContinuationWithStore();

      } else {
        var dist = erp.makeMarginalERP(this.returnHist);

        // Reinstate previous coroutine:
        env.coroutine = this.oldCoroutine;

        // Return from particle filter by calling original continuation:
        return this.k(this.oldStore, dist);

      }
    }
  };

  function pmc(s, cc, a, wpplFn, numParticles, numSweeps) {
    return new PMCMC(s, cc, a, wpplFn, numParticles, numSweeps).run();
  }


  ////////////////////////////////////////////////////////////////////
  // Particle filter with lightweight MH rejuvenation.
  //
  // Sequential importance re-sampling, which treats 'factor' calls as
  // the synchronization / intermediate distribution points.
  // After each factor particles are rejuvenated via lightweight MH.
  //
  // If numParticles==1 this amounts to MH with an (expensive) annealed init (but only returning one sample),
  // if rejuvSteps==0 this is a plain PF without any MH.

  var deepCopyTrace = function(trace) {
    return trace.map(function(obj) {
      var objCopy = util.copyObj(obj);
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
    for (var i = 0; i < numParticles; i++) {
      var particle = {
        continuation: function(s) {return wpplFn(s, exit, a);},
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
        {k: cc, name: a, erp: erp, params: params,
          score: currScore,
          choiceScore: choiceScore,
          val: val, reused: false,
          store: _.clone(s)});
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
    return ((this.particleIndex + 1) == this.particles.length);
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
    var W = util.logsumexp(_.map(this.particles, function(p) {return p.weight;}));
    var avgW = W - Math.log(m);

    // Allow -Infinity case (for mh initialization, in particular with few particles)
    if (avgW == -Infinity) {
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
          }});

    // Compute new particles
    var numNewParticles = m - retainedParticles.length;
    var newParticles = [];
    var j;
    for (var i = 0; i < numNewParticles; i++) {
      j = multinomialSample(newExpWeights);
      newParticles.push(copyPFRParticle(this.particles[j]));
    }

    // Particles after update: Retained + new particles
    this.particles = newParticles.concat(retainedParticles);

    // Reset all weights
    _.each(this.particles, function(particle) {particle.weight = avgW;});
  };

  ParticleFilterRejuv.prototype.exit = function(s, retval) {

    this.activeParticle().value = retval;

    // Wait for all particles to reach exit before computing
    // marginal distribution from particles
    if (!this.allParticlesAdvanced()) {
      this.particleIndex += 1;
      return this.activeParticle().continuation(this.activeParticle().store);
    }

    // Final rejuvenation:
    var oldStore = this.oldStore;
    var hist = {};
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
      return backToPF(particle);
    } else {
      return this.propose(); //FIXME: on final exit, will this end up calling the MH exit correctly?
    }
  };

  MHP.prototype.factor = function(s, k, a, sc) {
    this.currScore += sc;
    if (a == this.limitAddress) { //we need to exit if we've reached the fathest point of this particle...
      return exit(s);
    } else {
      return k(s);
    }
  };

  MHP.prototype.sample = function(s, k, name, erp, params, forceSample) {
    var prev = findChoice(this.oldTrace, name);

    var reuse = !(prev === undefined || forceSample);
    var val = reuse ? prev.val : erp.sample(params);
    var choiceScore = erp.score(params, val);
    this.trace.push({k: k, name: name, erp: erp, params: params,
      score: this.currScore, choiceScore: choiceScore,
      val: val, reused: reuse, store: _.clone(s)});
    this.currScore += choiceScore;
    return k(s, val);
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
    var acceptance = mhAcceptProb(this.trace, this.oldTrace,
                                  this.regenFrom,
                                  this.currScore, this.oldScore);

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
        this.hist[k] = { prob: 0, val: this.val };
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


  function pfr(s, cc, a, wpplFn, numParticles, rejuvSteps) {
    return new ParticleFilterRejuv(s, cc, a, wpplFn, numParticles, rejuvSteps).run();
  }


  ////////////////////////////////////////////////////////////////////
  // Simple Variational inference wrt the (pseudo)mean-field program.
  // We do stochastic gradient descent on the ERP params.
  // On sample statements: sample and accumulate grad-log-score, orig-score, and variational-score
  // On factor statements accumulate into orig-score.

  function Variational(s, k, a, wpplFn, estS) {

    this.wpplFn = wpplFn;
    this.estimateSamples = estS;
    this.numS = 0;
    this.t = 1;
    this.variationalParams = {};
    //historic gradient squared for each variational param, used for adagrad update:
    this.runningG2 = {};
    //gradient estimate per iteration:
    this.grad = {};
    //gradient of each sample used to estimate gradient:
    this.samplegrad = {};
    //running score accumulation per sample:
    this.jointScore = 0;
    this.variScore = 0;

    // Move old coroutine out of the way and install this as the current
    // handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;

    this.initialStore = s; // will be reinstated at the end
    this.initialAddress = a;

    //kick off the estimation:
    this.takeGradSample();
  }

  Variational.prototype.takeGradSample = function() {
    //reset sample info
    this.samplegrad = {};
    this.jointScore = 0;
    this.variScore = 0;
    //get another sample
    this.numS++;
    this.wpplFn(this.initialStore, exit, this.initialAddress);
  };

  Variational.prototype.sample = function(s, k, a, erp, params) {
    //sample from variational dist
    if (!this.variationalParams.hasOwnProperty(a)) {
      //initialize at prior (for this sample)...
      this.variationalParams[a] = params;
      this.runningG2[a] = [0];//fixme: vec size
    }
    var vParams = this.variationalParams[a];
    var val = erp.sample(vParams);

    //compute variational dist grad
    this.samplegrad[a] = erp.grad(vParams, val);

    //compute target score + variational score
    this.jointScore += erp.score(params, val);
    this.variScore += erp.score(vParams, val);

    k(s, val); //TODO: need a?
  };

  Variational.prototype.factor = function(s, k, a, score) {

    //update joint score and keep going
    this.jointScore += score;

    k(s); //TODO: need a?
  };

  Variational.prototype.exit = function(s, retval) {
    //FIXME: params are arrays, so need vector arithmetic or something..

    //update gradient estimate
    for (var a in this.samplegrad) {
      if (!this.grad.hasOwnProperty(a)) {
        //FIXME: size param vec:
        this.grad[a] = [0];
      }
      this.grad[a] = vecPlus(
          this.grad[a],
          vecScalarMult(this.samplegrad[a],
          (this.jointScore - this.variScore)));
    }

    //do we have as many samples as we need for this gradient estimate?
    if (this.numS < this.estimateSamples) {
      return this.takeGradSample();
    }

    //we have all our samples to do a gradient step.
    //use AdaGrad update rule.
    //update variational parameters:
    for (a in this.variationalParams) {
      for (var i in this.variationalParams[a]) {
        var grad = this.grad[a][i] / this.numS;
        this.runningG2[a][i] += Math.pow(grad, 2);
        var weight = 1.0 / Math.sqrt(this.runningG2[a][i]);
        //        console.log(a+" "+i+": weight "+ weight +" grad "+ grad +" vparam "+this.variationalParams[a][i])
        this.variationalParams[a][i] += weight * grad;
      }
    }
    this.t++;
    console.log(this.variationalParams);

    //if we haven't converged then do another gradient estimate and step:
    //FIXME: converence test instead of fixed number of grad steps?
    if (this.t < 500) {
      this.grad = {};
      this.numS = 0;
      return this.takeGradSample();
    }

    //return variational dist as ERP:
    //FIXME
    console.log(this.variationalParams);
    var dist = null;

    // Reinstate previous this:
    var k = this.k;
    var s = this.initialStore;
    env.coroutine = this.oldCoroutine;

    // Return from particle filter by calling original continuation:
    k(s, dist);
  };

  function vecPlus(a, b) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] + b[i];
    }
    return c;
  }

  function vecScalarMult(a, s) {
    var c = [];
    for (var i = 0; i < a.length; i++) {
      c[i] = a[i] * s;
    }
    return c;
  }

  function vari(s, cc, a, wpplFn, estS) {
    return new Variational(s, cc, a, wpplFn, estS);
  }


  ////////////////////////////////////////////////////////////////////
  // Some primitive functions to make things simpler

  function display(s, k, a, x) {
    return k(s, console.log(x));
  }

  // Caching for a wppl function f. caution: if f isn't deterministic
  // weird stuff can happen, since caching is across all uses of f, even
  // in different execuation paths.
  //FIXME: use global store for caching?
  function cache(s, k, a, f) {
    var c = {};
    var cf = function(s, k, a) {
      var args = Array.prototype.slice.call(arguments, 3);
      var stringedArgs = JSON.stringify(args);
      if (stringedArgs in c) {
        return k(s, c[stringedArgs]);
      } else {
        var newk = function(s, r) {
          c[stringedArgs] = r;
          return k(s, r);
        };
        return f.apply(this, [s, newk, a].concat(args));
      }
    };
    return k(s, cf);
  }

  // FIXME: handle fn.apply in cps transform?
  function apply(s, k, a, wpplFn, args) {
    return wpplFn.apply(global, [s, k, a].concat(args));
  }

  // FIXME: handle fn.apply in cps transform?
  function apply(s, k, a, wpplFn, args) {
    return wpplFn.apply(this, [s, k, a].concat(args));
  }


  ////////////////////////////////////////////////////////////////////

  var exports = {
    _: _,
    Enumerate: enuPriority,
    EnumerateBreadthFirst: enuFifo,
    EnumerateDepthFirst: enuFilo,
    EnumerateLikelyFirst: enuPriority,
    MH: mh,
    PMCMC: pmc,
    ParticleFilter: pf,
    ParticleFilterRejuv: pfr,
    Variational: vari,
    cache: cache,
    display: display,
    factor: factor,
    //getAddress: getAddress,
    sample: sample,
    sampleWithFactor: sampleWithFactor,
    util: util,
    apply: apply,
    assert: assert
  };

  _.each(erp, function(val, key) {
    exports[key] = val;
  });

  return exports;

};
