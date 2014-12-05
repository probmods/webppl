"use strict";

var _ = require('underscore');
var PriorityQueue = require('priorityqueuejs');
var util = require('./util.js');


// Top address for naming
var address = "";

// Top global store for mutation (eg conjugate models)
var globalStore = {};



////////////////////////////////////////////////////////////////////
// ERPs
//
// Elementary Random Primitives (ERPs) are the representation of
// distributions. They can have sampling, scoring, and support
// functions. A single ERP need not hve all three, but some inference
// functions will complain if they're missing one.
//
// The main thing we can do with ERPs in WebPPL is feed them into the
// "sample" primitive to get a sample. At top level we will also have
// some "inspection" functions to visualize them?
//
// erp.sample(params) returns a value sampled from the distribution.
// erp.score(params, val) returns the log-probability of val under the distribution.
// erp.support(params) gives an array of support elements.

function ERP(sampler, scorer, supporter) {
  this.sample = sampler;
  this.score = scorer;
  this.support = supporter;
}

var uniformERP = new ERP(
  function uniformSample(params){
    var u = Math.random();
    return (1-u)*params[0] + u*params[1];
  },
  function uniformScore(params, val){
    if (val < params[0] || val > params[1]) {
      return -Infinity;
    }
    return -Math.log(params[1] - params[0]);
  }
);

var bernoulliERP = new ERP(
  function flipSample(params) {
    var weight = params[0];
    var val = Math.random() < weight;
    return val;
  },
  function flipScore(params, val) {
    var weight = params[0];
    return val ? Math.log(weight) : Math.log(1 - weight);
  },
  function flipSupport(params) {
    return [true, false];
  }
);

var randomIntegerERP = new ERP(
  function randomIntegerSample(params) {
    return Math.floor(Math.random() * params[0]);
  },
  function randomIntegerScore(params, val) {
    var stop = params[0];
    var inSupport = (val == Math.floor(val)) && (0 <= val) && (val < stop);
    return inSupport ? -Math.log(stop) : -Infinity;
  },
  function randomIntegerSupport(params) {
    return _.range(params[0]);
  }
);

function gaussianSample(params){
  var mu = params[0];
  var sigma = params[1];
  var u, v, x, y, q;
  do {
    u = 1 - Math.random();
    v = 1.7156 * (Math.random() - .5);
    x = u - 0.449871;
    y = Math.abs(v) + 0.386595;
    q = x*x + y*(0.196*y - 0.25472*x);
  } while(q >= 0.27597 && (q > 0.27846 || v*v > -4 * u * u * Math.log(u)))
  return mu + sigma*v/u;
}

function gaussianScore(params, x){
  var mu = params[0];
  var sigma = params[1];
  return -.5*(1.8378770664093453 + 2*Math.log(sigma) + (x - mu)*(x - mu)/(sigma*sigma));
}

function gaussianFactor(store, k, addr, mu, std, val){
  coroutine.factor(store, k, addr, gaussianScore([mu, std], val));
}

function erpFactor(store, k, addr, erp, params, val){
  coroutine.factor(store, k, addr, erp.score(params, val));
}

var gaussianERP = new ERP(gaussianSample, gaussianScore);

var discreteERP = new ERP(
  function discreteSample(params){
    return multinomialSample(params[0]);
  },
  function discreteScore(params, val) {
    var probs = util.normalizeArray(params[0]);
    var stop = probs.length;
    var inSupport = (val == Math.floor(val)) && (0 <= val) && (val < stop);
    return inSupport ? Math.log(probs[val]) : -Infinity;
  },
  function discreteSupport(params) {
    return _.range(params[0].length);
  }
);

var gammaCof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];

function logGamma(xx) {
  var x = xx - 1.0;
  var tmp = x + 5.5; tmp -= (x + 0.5)*Math.log(tmp);
  var ser=1.000000000190015;
  for (var j=0;j<=5;j++){ x++; ser += gammaCof[j]/x; }
  return -tmp+Math.log(2.5066282746310005*ser);
}

function gammaSample(params){
  var a = params[0];
  var b = params[1];
  if (a < 1) {
    return gammaSample(1+a,b) * Math.pow(Math.random(), 1/a);
  }
  var x, v, u;
  var d = a-1/3;
  var c = 1/Math.sqrt(9*d);
  while (true) {
    do{x = gaussianSample([0,1]);  v = 1+c*x;} while(v <= 0);
    v=v*v*v;
    u=Math.random();
    if((u < 1 - .331*x*x*x*x) || (Math.log(u) < .5*x*x + d*(1 - v + Math.log(v)))) return b*d*v;
  }
}

// params are shape and scale
var gammaERP = new ERP(
  gammaSample,
  function gammaScore(params, val){
    var a = params[0];
    var b = params[1];
    var x = val;
    return (a - 1)*Math.log(x) - x/b - logGamma(a) - a*Math.log(b);
  }
);

var exponentialERP = new ERP(
  function exponentialSample(params){
    var a = params[0];
    var u = Math.random();
    return Math.log(u) / (-1 * a);
  },
  function exponentialScore(params, val){
    var a = params[0];
    return Math.log(a) - a * val;
  }
);

function logBeta(a, b){
  return logGamma(a) + logGamma(b) - logGamma(a+b);
}

function betaSample(params){
  var a = params[0];
  var b = params[1];
  var x = gammaSample([a, 1]);
  return x / (x + gammaSample([b, 1]));
}

var betaERP = new ERP(
  betaSample,
  function betaScore(params, val){
    var a = params[0];
    var b = params[1];
    var x = val;
    return ((x > 0 && x < 1)
            ? (a-1)*Math.log(x) + (b-1)*Math.log(1-x) - logBeta(a,b)
            : -Infinity);
  }
);

function binomialG(x){
  if (x == 0) return 1;
  if (x == 1) return 0;
  var d = 1 - x;
  return (1 - (x * x) + (2 * x * Math.log(x))) / (d * d);
}

function binomialSample(params){
  var p = params[0];
  var n = params[1];
  var k = 0;
  var N = 10;
  var a, b;
  while (n > N){
    a = 1 + n/2;
    b = 1 + n-a;
    var x = betaSample([a, b]);
    if (x >= p){
      n = a-1; p /= x;
    }
    else{ k += a; n = b - 1; p = (p-x) / (1-x); }
  }
  var u;
  for (var i=0; i<n; i++){
    u = Math.random();
    if (u < p) k++;
  }
  return k | 0;
}

var binomialERP = new ERP(
  binomialSample,
  function binomialScore(params, val){
    var p = params[0];
    var n = params[1];
    var s = val;
    var inv2 = 1/2;
    var inv3 = 1/3;
    var inv6 = 1/6;
    if (s >= n) return -Infinity;
    var q = 1-p;
    var S = s + inv2;
    var T = n - s - inv2;
    var d1 = s + inv6 - (n + inv3) * p;
    var d2 = q/(s+inv2) - p/(T+inv2) + (q-inv2)/(n+1);
    d2 = d1 + 0.02*d2;
    var num = 1 + q * binomialG(S/(n*p)) + p * binomialG(T/(n*q));
    var den = (n + inv6) * p * q;
    var z = num / den;
    var invsd = Math.sqrt(z);
    z = d2 * invsd;
    return gaussianScore([0, 1], z) + Math.log(invsd);
  },
  function binomialSupport(params) {
    return _.range(params[1]);
  }
);

function fact(x){
  var t=1;
  while(x>1) t*=x--;
  return t;
}

function lnfact(x) {
  if (x < 1) x = 1;
  if (x < 12) return Math.log(fact(Math.round(x)));
  var invx = 1 / x;
  var invx2 = invx * invx;
  var invx3 = invx2 * invx;
  var invx5 = invx3 * invx2;
  var invx7 = invx5 * invx2;
  var sum = ((x + 0.5) * Math.log(x)) - x;
  sum += Math.log(2*Math.PI) / 2;
  sum += (invx / 12) - (invx3 / 360);
  sum += (invx5 / 1260) - (invx7 / 1680);
  return sum;
}

var poissonERP = new ERP(
  function poissonSample(params){
    var mu = params[0];
    var k = 0;
    while(mu > 10) {
      var m = 7/8*mu;
      var x = gammaSample([m, 1]);
      if (x > mu) {
        return (k + binomialSample([mu/x, m-1])) | 0;
      } else {
        mu -= x;
        k += m;
      }
    }
    var emu = Math.exp(-mu);
    var p = 1;
    do{ p *= Math.random(); k++; } while(p > emu);
    return (k-1) | 0;
  },
  function poissonScore(params, val){
    var mu = params[0];
    return k * Math.log(mu) - mu - lnfact(k);
  }
);

var dirichletERP = new ERP(
  function dirichletSample(params){
    var alpha = params;
    var ssum = 0;
    var theta = [];
    var t;
    for (var i = 0; i < alpha.length; i++) {
      t = gammaSample([alpha[i], 1]);
      theta[i] = t;
      ssum = ssum + t;
    }
    for (var i = 0; i < theta.length; i++) {
      theta[i] /= ssum;
    }
    return theta;
  },
  function dirichletScore(params, val){
    var alpha = params;
    var theta = val;
    var asum = 0;
    for (var i = 0; i < alpha.length; i++) {
      asum += alpha[i];
    }
    var logp = logGamma(asum);
    for (var i = 0; i < alpha.length; i++){
      logp += (alpha[i]-1)*Math.log(theta[i]);
      logp -= logGamma(alpha[i]);
    }
    return logp;
  }
);

function multinomialSample(theta) {
  var thetaSum = util.sum(theta);
  var x = Math.random() * thetaSum;
  var k = theta.length;
  var probAccum = 0;
  for (var i = 0; i < k; i++) {
    probAccum += theta[i];
    if (probAccum >= x) {
      return i;
    } //FIXME: if x=0 returns i=0, but this isn't right if theta[0]==0...
  }
  return k;
}

//make a discrete ERP from a {val: prob, etc.} object (unormalized).
function makeMarginalERP(marginal) {
  //normalize distribution:
  var norm = 0;
  var supp = [];
  for (var v in marginal) {
    norm += marginal[v].prob;
    supp.push(marginal[v].val);
  }
  for (var v in marginal) {
    marginal[v].prob = marginal[v].prob / norm;
  }

  // console.log("Creating distribution: ");
  // console.log(marginal);

  //make an ERP from marginal:
  var dist = new ERP(
    function(params) {
      var k = marginal.length;
      var x = Math.random();
      var probAccum = 0;
      for (var i in marginal) {
        probAccum += marginal[i].prob;
        if (probAccum >= x) {
          return marginal[i].val;
        } //FIXME: if x=0 returns i=0, but this isn't right if theta[0]==0...
      }
      return marginal[i].val;
    },
    function(params, val) {
      for(var i in marginal){
        // if(marginal[i].val == val){return Math.log(marginal[i].prob)}
        if(i == JSON.stringify(val)){return Math.log(marginal[i].prob)}
      }
      return -Infinity
    },
    function(params) {
      return supp;
    });
  return dist;
}



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
var coroutine = {
  sample: function(s, cc, a, erp, params) {
    // Sample and keep going
    cc(s, erp.sample(params));
  },
  factor: function() {
    throw "factor allowed only inside inference.";
  },
  exit: function(s,r) {
    return r;
  }
};

// Functions that call methods of whatever the coroutine is set to
// when called, we do it like this so that 'this' will be set
// correctly to the coroutine object.
function sample(s, k, a, dist, params) {
  coroutine.sample(s, k, a, dist, params);
}

function factor(s, k, a, score) {
  coroutine.factor(s, k, a, score);
}

function sampleWithFactor(s, k, a, dist, params, scoreFn) {
  if(typeof coroutine.sampleWithFactor  == "function"){
    coroutine.sampleWithFactor(s, k, a, dist, params, scoreFn);
  } else {
    sample(s,
           function(v){
            scoreFn(s, function(sc){factor(s,function(){k(v);},a+"swf2",sc);}, a+"swf1", v);},
           a, dist, params);
  }
}

function exit(s,retval) {
  coroutine.exit(s,retval);
}



////////////////////////////////////////////////////////////////////
// Enumeration
//
// Depth-first enumeration of all the paths through the computation.
// Q is the queue object to use. It should have enq, deq, and size methods.

function Enumerate(s, k, a, wpplFn, maxExecutions, Q) {

  this.score = 0; // Used to track the score of the path currently being explored
  this.queue = Q; // Queue of states that we have yet to explore
  this.marginal = {}; // We will accumulate the marginal distribution here
  this.numCompletedExecutions = 0;
  this.maxExecutions = maxExecutions || 1000;

  this.oldStore = s; // will be reinstated at the end

  // Move old coroutine out of the way and install this as the current handler
  this.k = k;
  this.oldCoroutine = coroutine;
  coroutine = this;

  // Run the wppl computation, when the computation returns we want it
  // to call the exit method of this coroutine so we pass that as the
  // continuation.
  wpplFn(s, exit, a);
}

// The queue is a bunch of computation states. each state is a
// continuation, a value to apply it to, and a score.
//
// This function runs the highest priority state in the
// queue. Currently priority is score, but could be adjusted to give
// depth-first or breadth-first or some other search strategy

var stackSize = 0;

Enumerate.prototype.nextInQueue = function() {
  var nextState = this.queue.deq();
  this.score = nextState.score;
  //  util.withEmptyStack(function(){nextState.continuation(nextState.value)});

  stackSize++;
  if (stackSize == 5) {
    util.withEmptyStack(function(){nextState.continuation(nextState.store, nextState.value);});
  } else {
    nextState.continuation(nextState.store, nextState.value);
    stackSize = 0;
  }
};


Enumerate.prototype.sample = function(store, cc, a, dist, params, extraScoreFn) {

  //allows extra factors to be taken into account in making exploration decisions:
  extraScoreFn = extraScoreFn || function(x){return 0;};

  // Find support of this erp:
  if (!dist.support) {
    throw "Enumerate can only be used with ERPs that have support function.";
  }
  var supp = dist.support(params);

  // For each value in support, add the continuation paired with
  // support value and score to queue:
  for (var s in supp) {
    var state = {
      continuation: cc,
      value: supp[s],
      score: this.score + dist.score(params, supp[s]) + extraScoreFn(supp[s]),
      store: util.copyObj(store)
    };
    this.queue.enq(state);
  }
  // Call the next state on the queue
  this.nextInQueue();
};

Enumerate.prototype.factor = function(s,cc,a, score) {
  // Update score and continue
  this.score += score;
  cc(s);
};

Enumerate.prototype.sampleWithFactor = function(s,cc,a,dist,params,scoreFn) {
  coroutine.sample(s,cc,a,dist,params,
                   function(v){
                    var ret;
                    scoreFn(s,function(x){ret = x;},a+"swf",v);
                    return ret;});
};


Enumerate.prototype.exit = function(s,retval) {

  // We have reached an exit of the computation. Accumulate probability into retval bin.
  var r = JSON.stringify(retval);
  if (this.marginal[r] == undefined) {
    this.marginal[r] = {prob: 0, val: retval};
  }
  this.marginal[r].prob += Math.exp(this.score);

  // Increment the completed execution counter
  this.numCompletedExecutions++;

  // If anything is left in queue do it:
  if (this.queue.size() > 0 && (this.numCompletedExecutions < this.maxExecutions)) {
    this.nextInQueue();
  } else {
    var marginal = this.marginal;
    var dist = makeMarginalERP(marginal);
    // Reinstate previous coroutine:
    coroutine = this.oldCoroutine;
    // Return from enumeration by calling original continuation with original store:
    this.k(this.oldStore, dist);
  }
};

//helper wraps with 'new' to make a new copy of Enumerate and set 'this' correctly..
function enuPriority(s,cc, a, wpplFn, maxExecutions) {
  var q = new PriorityQueue(function(a, b){return a.score-b.score;});
  return new Enumerate(s,cc,a, wpplFn, maxExecutions, q);
}

function enuFilo(s,cc,a, wpplFn, maxExecutions) {
  var q = [];
  q.size = function(){return q.length;};
  q.enq = q.push;
  q.deq = q.pop;
  return new Enumerate(s,cc,a, wpplFn, maxExecutions, q);
}

function enuFifo(s,cc,a, wpplFn, maxExecutions) {
  var q = [];
  q.size = function(){return q.length;};
  q.enq = q.push;
  q.deq = q.shift;
  return new Enumerate(s,cc,a, wpplFn, maxExecutions, q);
}


////////////////////////////////////////////////////////////////////
// Particle filtering
//
// Sequential importance re-sampling, which treats 'factor' calls as
// the synchronization / intermediate distribution points.

function copyParticle(particle){
  return {
    continuation: particle.continuation,
    weight: particle.weight,
    value: particle.value,
    store: util.copyObj(particle.store)
  };
}

function ParticleFilter(s, k, a, wpplFn, numParticles) {

  this.particles = [];
  this.particleIndex = 0;  // marks the active particle

  // Create initial particles
  for (var i=0; i<numParticles; i++) {
    var particle = {
      continuation: function(s){wpplFn(s,exit,a);},
      weight: 0,
      value: undefined,
      store: s
    };
    this.particles.push(particle);
  }

  // Move old coroutine out of the way and install this as the current
  // handler.
  this.k = k;
  this.oldCoroutine = coroutine;
  coroutine = this;

  this.oldStore = util.copyObj(s); // will be reinstated at the end

  // Run first particle
  this.activeParticle().continuation(this.activeParticle().store);
}

ParticleFilter.prototype.sample = function(s,cc, a, erp, params) {
  cc(s,erp.sample(params));
};

ParticleFilter.prototype.factor = function(s,cc, a, score) {
  // Update particle weight
  this.activeParticle().weight += score;
  this.activeParticle().continuation = cc;
  this.activeParticle().store = s;

  if (this.allParticlesAdvanced()){
    // Resample in proportion to weights
    this.resampleParticles();
    this.particleIndex = 0;
  } else {
    // Advance to the next particle
    this.particleIndex += 1;
  }

  util.withEmptyStack(function(){coroutine.activeParticle().continuation(coroutine.activeParticle().store);});
};

ParticleFilter.prototype.activeParticle = function() {
  return this.particles[this.particleIndex];
};

ParticleFilter.prototype.allParticlesAdvanced = function() {
  return ((this.particleIndex + 1) == this.particles.length);
};

ParticleFilter.prototype.resampleParticles = function() {
  // Residual resampling following Liu 2008; p. 72, section 3.4.4

  var m = this.particles.length;
  var W = util.logsumexp(_.map(this.particles, function(p){return p.weight;}));

  // Compute list of retained particles
  var retainedParticles = [];
  var retainedCounts = [];
  _.each(
    this.particles,
    function(particle){
      var numRetained = Math.floor(Math.exp(Math.log(m) + (particle.weight - W)));
      for (var i=0; i<numRetained; i++){
        retainedParticles.push(copyParticle(particle));
      }
      retainedCounts.push(numRetained);
    });

  // Compute new particles
  var numNewParticles = m - retainedParticles.length;
  var newExpWeights = [];
  var w, tmp;
  for (var i in this.particles){
    tmp = Math.log(m) + (this.particles[i].weight - W);
    w = Math.exp(tmp) - retainedCounts[i];
    newExpWeights.push(w);
  }
  var newParticles = [];
  var j;
  for (var i=0; i<numNewParticles; i++){
    j = multinomialSample(newExpWeights);
    newParticles.push(copyParticle(this.particles[j]));
  }

  // Particles after update: Retained + new particles
  this.particles = newParticles.concat(retainedParticles);

  // Reset all weights
  _.each(
    this.particles,
    function(particle){
      particle.weight = W - Math.log(m);
    });
};

ParticleFilter.prototype.exit = function(s,retval) {

  this.activeParticle().value = retval;

  // Wait for all particles to reach exit before computing
  // marginal distribution from particles
  if (!this.allParticlesAdvanced()){
    this.particleIndex += 1;
    return this.activeParticle().continuation(this.activeParticle().store);
  }

  // Compute marginal distribution from (unweighted) particles
  var hist = {};
  _.each(
    this.particles,
    function(particle){
      var k = JSON.stringify(particle.value);
      if (hist[k] === undefined){
        hist[k] = { prob:0, val:particle.value };
      }
      hist[k].prob += 1;
    });
  var dist = makeMarginalERP(hist);

  // Reinstate previous coroutine:
  coroutine = this.oldCoroutine;

  // Return from particle filter by calling original continuation:
  this.k(this.oldStore, dist);
}

function pf(s, cc, a, wpplFn, numParticles) {
  return new ParticleFilter(s, cc, a, wpplFn, numParticles);
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
  this.oldStore = util.copyObj(s);
  this.iterations = numIterations;

  // Move old coroutine out of the way and install this as the current
  // handler.
  this.oldCoroutine = coroutine;
  coroutine = this;

  wpplFn(s, exit, a);
}

MH.prototype.factor = function(s, k, a, score) {
  coroutine.currScore += score;
  util.withEmptyStack(function(){k(s);});
};

MH.prototype.sample = function(s, cont, name, erp, params, forceSample) {
  var prev = findChoice(coroutine.oldTrace, name);
  var reuse = ! (prev==undefined | forceSample);
  var val = reuse ? prev.val : erp.sample(params);
  var choiceScore = erp.score(params,val);
  coroutine.trace.push({k: cont, name: name, erp: erp, params: params,
                       score: coroutine.currScore, choiceScore: choiceScore,
                       val: val, reused: reuse, store: util.copyObj(s)});
  coroutine.currScore += choiceScore;
  cont(s, val);
};

function findChoice(trace, name) {
  if (trace == undefined){
    return undefined;
  }
  for (var i = 0; i < trace.length; i++){
    if (trace[i].name == name){
      return trace[i];
    }
  }
  return undefined;
}

function MHacceptProb(trace, oldTrace, regenFrom, currScore, oldScore){
  if(oldTrace == undefined){return 1;} //just for init
  var fw = -Math.log(oldTrace.length);
  trace.slice(regenFrom).map(function(s){fw += s.reused?0:s.choiceScore;});
  var bw = -Math.log(trace.length);
  oldTrace.slice(regenFrom).map(function(s){
    var nc = findChoice(trace, s.name);
    bw += (!nc || !nc.reused) ? s.choiceScore : 0;  });
  var acceptance = Math.min(1, Math.exp(currScore - oldScore + bw - fw));
  return acceptance;
}

MH.prototype.exit = function(s, val) {
  if (coroutine.iterations > 0) {
    coroutine.iterations -= 1;

    //did we like this proposal?
    var acceptance = MHacceptProb(coroutine.trace, coroutine.oldTrace,
                                  coroutine.regenFrom, coroutine.currScore, coroutine.oldScore);
    if (!(Math.random()<acceptance)){
      // if rejected, roll back trace, etc:
      coroutine.trace = coroutine.oldTrace;
      coroutine.currScore = coroutine.oldScore;
      val = coroutine.oldVal;
    }

    // now add val to hist:
    var stringifiedVal = JSON.stringify(val);
    if (coroutine.returnHist[stringifiedVal] === undefined){
      coroutine.returnHist[stringifiedVal] = { prob:0, val:val };
    }
    coroutine.returnHist[stringifiedVal].prob += 1;

    // make a new proposal:
    coroutine.regenFrom = Math.floor(Math.random() * coroutine.trace.length);
    var regen = coroutine.trace[coroutine.regenFrom];
    coroutine.oldTrace = coroutine.trace;
    coroutine.trace = coroutine.trace.slice(0, coroutine.regenFrom);
    coroutine.oldScore = coroutine.currScore;
    coroutine.currScore = regen.score;
    coroutine.oldVal = val;

    coroutine.sample(regen.store, regen.k, regen.name, regen.erp, regen.params, true);
  } else {
    var dist = makeMarginalERP(coroutine.returnHist);

    // Reinstate previous coroutine:
    var k = coroutine.k;
    coroutine = this.oldCoroutine;

    // Return by calling original continuation:
    k(this.oldStore, dist);
  }
};

function mh(s, cc, a, wpplFn, numParticles) {
  return new MH(s, cc, a, wpplFn, numParticles);
}


////////////////////////////////////////////////////////////////////
// PMCMC

function last(xs){
  return xs[xs.length - 1];
}

function PMCMC(s, cc, a, wpplFn, numParticles, numSweeps){

  // Move old coroutine out of the way and install this as the
  // current handler.
  this.oldCoroutine = coroutine;
  coroutine = this;

  // Store continuation (will be passed dist at the end)
  this.k = cc;

  this.oldStore = util.copyObj(s);

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

  // Run first particle
  this.activeContinuationWithStore()();
}

PMCMC.prototype.resetParticles = function(){
  var that = this;
  this.particles = [];
  // Create initial particles
  for (var i=0; i<this.numParticles; i++) {
    var particle = {
      continuations: [function(s){that.wpplFn(s, exit, that.address);}],
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

PMCMC.prototype.activeContinuation = function(){
  return last(this.activeParticle().continuations);
};

PMCMC.prototype.activeContinuationWithStore = function(){
  var k = last(this.activeParticle().continuations);
  var s = last(this.activeParticle().stores);
  return function(){k(s);};
};

PMCMC.prototype.allParticlesAdvanced = function() {
  return ((this.particleIndex + 1) == this.particles.length);
};

PMCMC.prototype.sample = function(s, cc, a, erp, params) {
  cc(s, erp.sample(params));
};

PMCMC.prototype.particleAtStep = function(particle, step){
  // Returns particle s.t. particle.continuations[step] is the last entry
  return {
    continuations: particle.continuations.slice(0, step + 1),
    stores: particle.stores.slice(0, step + 1),
    weights: particle.weights.slice(0, step + 1),
    value: particle.value
  };
};

PMCMC.prototype.updateActiveParticle = function(weight, continuation, store){
  var particle = this.activeParticle();
  particle.continuations = particle.continuations.concat([continuation]);
  particle.stores = particle.stores.concat([util.copyObj(store)]);
  particle.weights = particle.weights.concat([weight]);
};

PMCMC.prototype.copyParticle = function(particle){
  return {
    continuations: particle.continuations.slice(0),
    weights: particle.weights.slice(0),
    value: particle.value,
    stores: particle.stores.map(util.copyObj)
  };
};

PMCMC.prototype.resampleParticles = function(particles){
  var weights = particles.map(
    function(particle){return Math.exp(last(particle.weights));});

  var j;
  var newParticles = [];
  for (var i=0; i<particles.length; i++){
    j = multinomialSample(weights);
    newParticles.push(this.copyParticle(particles[j]));
  }

  return newParticles;
};

PMCMC.prototype.factor = function(s, cc, a, score) {

  this.updateActiveParticle(score, cc, s);

  if (this.allParticlesAdvanced()){
    if (this.sweep > 0){
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

  util.withEmptyStack(this.activeContinuationWithStore());
};

PMCMC.prototype.exit = function(s, retval) {

  this.activeParticle().value = retval;

  if (!this.allParticlesAdvanced()){

    // Wait for all particles to reach exit
    this.particleIndex += 1;
    return this.activeContinuationWithStore()();

  } else {

    // Use all (unweighted) particles from the conditional SMC
    // iteration to estimate marginal distribution.
    if (this.sweep > 0) {
      _.each(
        this.particles.concat(this.retainedParticle),
        function(particle){
          var k = JSON.stringify(particle.value);
          if (coroutine.returnHist[k] === undefined){
            coroutine.returnHist[k] = { prob:0, val:particle.value };
          }
          coroutine.returnHist[k].prob += 1;
        });
    };

    // Retain the first particle sampled after the final factor statement.
    this.retainedParticle = this.particles[0];

    if (this.sweep < this.numSweeps) {

      // Reset non-retained particles, restart
      this.sweep += 1;
      this.particleIndex = 0;
      this.resetParticles();
      this.activeContinuationWithStore()();

    } else {
      var dist = makeMarginalERP(this.returnHist);

      // Reinstate previous coroutine:
      coroutine = this.oldCoroutine;

      // Return from particle filter by calling original continuation:
      this.k(this.oldStore, dist);

    }
  }
};

function pmc(s, cc, a, wpplFn, numParticles, numSweeps) {
  return new PMCMC(s, cc, a, wpplFn, numParticles, numSweeps);
}



////////////////////////////////////////////////////////////////////
// Some primitive functions to make things simpler

function display(k, a, x) {
  k(console.log(x));
}

//function callPrimitive(k, a, f) {
//  var args = Array.prototype.slice.call(arguments, 2);
//  k(f.apply(f, args));
//}

// Caching for a wppl function f. caution: if f isn't deterministic
// weird stuff can happen, since caching is across all uses of f, even
// in different execuation paths.
function cache(k, a, f) {
  var c = {};
  var cf = function(k) {
    var args = Array.prototype.slice.call(arguments, 1);
    var stringedArgs = JSON.stringify(args)
    if (stringedArgs in c) {
      k(c[stringedArgs]);
    } else {
      var newk = function(r) {
        c[stringedArgs] = r;
        k(r);
      };
      f.apply(this, [newk].concat(args));
    }
  };
  k(cf);
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


function ParticleFilterRejuv(s,k,a, wpplFn, numParticles,rejuvSteps) {

  this.particles = [];
  this.particleIndex = 0;  // marks the active particle
  this.rejuvSteps = rejuvSteps;
  this.baseAddress = a;
  this.wpplFn = wpplFn;

  // Move old coroutine out of the way and install this as the current
  // handler.
  this.k = k;
  this.oldCoroutine = coroutine;
  coroutine = this;

  this.oldStore = s; // will be reinstated at the end

  // Create initial particles
  for (var i=0; i<numParticles; i++) {
    var particle = {
    continuation: function(s){wpplFn(s,exit,a);},
    weight: 0,
    score: 0,
    value: undefined,
    trace: [],
    store: s
    };
    coroutine.particles.push(particle);
  }

  // Run first particle
  coroutine.activeParticle().continuation(coroutine.activeParticle().store);
}

ParticleFilterRejuv.prototype.sample = function(s,cc,a, erp, params) {
  var val = erp.sample(params);
  var choiceScore = erp.score(params,val);
  coroutine.activeParticle().trace.push(
                                   {k: cc, name: a, erp: erp, params: params,
                                   score: undefined, //FIXME: need to track particle total score?
                                   choiceScore: choiceScore,
                                   val: val, reused: false,
                                   store: s});
  coroutine.activeParticle().score += choiceScore;
  cc(s,val);
};

ParticleFilterRejuv.prototype.factor = function(s,cc,a, score) {
  // Update particle weight and score
  coroutine.activeParticle().weight += score;
  coroutine.activeParticle().score += score;
  coroutine.activeParticle().continuation = cc;
  coroutine.activeParticle().store = s;

  if (coroutine.allParticlesAdvanced()){
    // Resample in proportion to weights
    coroutine.resampleParticles();
    //rejuvenate each particle via MH
    coroutine.particles.forEach(
      function(particle,i,particles){
        new MHP(function(p){particles[i]=p;},
                particle, coroutine.baseAddress,
                a, coroutine.wpplFn, coroutine.rejuvSteps);
      });
    coroutine.particleIndex = 0;
  } else {
    // Advance to the next particle
    coroutine.particleIndex += 1;
  }

  util.withEmptyStack(function(){coroutine.activeParticle().continuation(coroutine.activeParticle().store);});
};

ParticleFilterRejuv.prototype.activeParticle = function() {
  return coroutine.particles[coroutine.particleIndex];
};

ParticleFilterRejuv.prototype.allParticlesAdvanced = function() {
  return ((coroutine.particleIndex + 1) == coroutine.particles.length);
};

function copyPFRParticle(particle){
  return {
  continuation: particle.continuation,
  weight: particle.weight,
  value: particle.value,
  score: particle.score,
  store: particle.store,
  trace: particle.trace //FIXME: need to deep copy trace??
  };
}

ParticleFilterRejuv.prototype.resampleParticles = function() {
  // Residual resampling following Liu 2008; p. 72, section 3.4.4

  var m = coroutine.particles.length;
  var W = util.logsumexp(_.map(coroutine.particles, function(p){return p.weight;}));

  // Compute list of retained particles
  var retainedParticles = [];
  var retainedCounts = [];
  _.each(
    coroutine.particles,
    function(particle){
      var numRetained = Math.floor(Math.exp(Math.log(m) + (particle.weight - W)));
      for (var i=0; i<numRetained; i++){
        retainedParticles.push(copyPFRParticle(particle));
      }
      retainedCounts.push(numRetained);
    });

  // Compute new particles
  var numNewParticles = m - retainedParticles.length;
  var newExpWeights = [];
  var w, tmp;
  for (var i in this.particles){
    tmp = Math.log(m) + (coroutine.particles[i].weight - W);
    w = Math.exp(tmp) - retainedCounts[i];
    newExpWeights.push(w);
  }
  var newParticles = [];
  var j;
  for (var i=0; i<numNewParticles; i++){
    j = multinomialSample(newExpWeights);
    newParticles.push(copyPFRParticle(this.particles[j]));
  }

  // Particles after update: Retained + new particles
  coroutine.particles = newParticles.concat(retainedParticles);

  // Reset all weights
  _.each(
    coroutine.particles,
    function(particle){
      particle.weight = W - Math.log(m);
    });
};

ParticleFilterRejuv.prototype.exit = function(s,retval) {

  coroutine.activeParticle().value = retval;

  // Wait for all particles to reach exit before computing
  // marginal distribution from particles
  if (!coroutine.allParticlesAdvanced()){
    coroutine.particleIndex += 1;
    return coroutine.activeParticle().continuation(coroutine.activeParticle().store);
  }

  //Final rejuvenation:
  coroutine.particles.forEach(
    function(particle,i,particles){
      new MHP(function(p){particles[i]=p;},
              particle, coroutine.baseAddress,
              undefined, coroutine.wpplFn, coroutine.rejuvSteps);
    });

  // Compute marginal distribution from (unweighted) particles
  var hist = {};
  _.each(
    coroutine.particles,
    function(particle){
      var k = JSON.stringify(particle.value);
      if (hist[k] === undefined){
        hist[k] = { prob:0, val:particle.value };
      }
      hist[k].prob += 1;
    });
  var dist = makeMarginalERP(hist);

  // Reinstate previous coroutine:
  var k = coroutine.k;
  coroutine = coroutine.oldCoroutine;

  // Return from particle filter by calling original continuation:
  k(this.oldStore, dist);
};


////// Lightweight MH on a particle

function MHP(backToPF, particle, baseAddress, limitAddress , wpplFn, numIterations) {

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

  // FIXME: do we need to save the store here?

  //  console.log("MH "+numIterations+" steps")

  if(numIterations==0) {
    backToPF(particle);
  } else {
    // Move PF coroutine out of the way and install this as the current
    // handler.
    this.oldCoroutine = coroutine;
    coroutine = this;
    coroutine.propose(); //FIXME: on final exit, will this end up calling the MH exit correctly?
  }
}

MHP.prototype.factor = function(s,k,a,sc) {
  coroutine.currScore += sc;
  if(a == coroutine.limitAddress) { //we need to exit if we've reached the fathest point of this particle...
    exit(s);
  } else {
    k(s);
  }
};

MHP.prototype.sample = function(s,k, name, erp, params, forceSample) {
  var prev = findChoice(coroutine.oldTrace, name);
  var reuse = ! (prev==undefined | forceSample);
  var val = reuse ? prev.val : erp.sample(params);
  var choiceScore = erp.score(params,val);
  coroutine.trace.push({k: k, name: name, erp: erp, params: params,
                       score: coroutine.currScore, choiceScore: choiceScore,
                       val: val, reused: reuse, store:s});
  coroutine.currScore += choiceScore;
  k(s,val);
};


MHP.prototype.propose = function() {
  //  console.log("MH proposal it: "+coroutine.iterations+"")
  //make a new proposal:
  coroutine.regenFrom = Math.floor(Math.random() * coroutine.trace.length);
  var regen = coroutine.trace[coroutine.regenFrom];
  coroutine.oldTrace = coroutine.trace;
  coroutine.trace = coroutine.trace.slice(0,coroutine.regenFrom);
  coroutine.oldScore = coroutine.currScore;
  coroutine.currScore = regen.score;
  coroutine.oldVal = coroutine.val;

  coroutine.sample(regen.store, regen.k, regen.name, regen.erp, regen.params, true);
};

MHP.prototype.exit = function(s,val) {

  coroutine.val = val;

  //did we like this proposal?
  var acceptance = MHacceptProb(coroutine.trace, coroutine.oldTrace,
                                coroutine.regenFrom, coroutine.currScore, coroutine.oldScore);
  if (!(Math.random()<acceptance)){
    //if rejected, roll back trace, etc:
    coroutine.trace = coroutine.oldTrace;
    coroutine.currScore = coroutine.oldScore;
    coroutine.val = coroutine.oldVal;
  }

  coroutine.iterations -= 1;

  if( coroutine.iterations > 0 ) {
    coroutine.propose();
  } else {
    var newParticle = {continuation: coroutine.originalParticle.continuation,
                        weight: coroutine.originalParticle.weight,
                        value: coroutine.val,
                        trace: coroutine.trace,
                        store: s
                      };

    // Reinstate previous coroutine and return by calling original continuation:
    var backToPF = coroutine.backToPF;
    coroutine = coroutine.oldCoroutine;
    backToPF(newParticle);
  }
}


function pfr(s,cc, a, wpplFn, numParticles, rejuvSteps) {
  return new ParticleFilterRejuv(s,cc, a, wpplFn, numParticles, rejuvSteps);
}



////////////////////////////////////////////////////////////////////
// Some primitive functions to make things simpler

function display(s,k, a, x) {
  k(s,console.log(x));
}

// Caching for a wppl function f. caution: if f isn't deterministic
// weird stuff can happen, since caching is across all uses of f, even
// in different execuation paths.
//FIXME: use global store for caching?
function cache(s,k, a, f) {
  var c = {};
  var cf = function(s,k) {
    var args = Array.prototype.slice.call(arguments, 2);
    var stringedArgs = JSON.stringify(args);
    if (stringedArgs in c) {
      k(s,c[stringedArgs]);
    } else {
      var newk = function(s,r) {
        c[stringedArgs] = r;
        k(s,r);
      };
      f.apply(this, [s,newk].concat(args));
    }
  };
  k(s,cf);
}

function withEmptyWebPPLStack(store, k, a, thunk){
  util.withEmptyStack(function(){
    return thunk(store, k, a);
  });
}

function getAddress(store, k, a){
  var addressArray = a.split("_").slice(1);
  for (var i=0; i<addressArray.length; i++){
    addressArray[i] = parseInt(addressArray[i]);
  }
  k(store, addressArray);
}


////////////////////////////////////////////////////////////////////

module.exports = {
  ERP: ERP,
  Enumerate: enuPriority,
  EnumerateBreadthFirst: enuFifo,
  EnumerateDepthFirst: enuFilo,
  EnumerateLikelyFirst: enuPriority,
  MH: mh,
  PMCMC: pmc,
  ParticleFilter: pf,
  ParticleFilterRejuv: pfr,
  address: address,
  bernoulliERP: bernoulliERP,
  betaERP: betaERP,
  binomialERP: binomialERP,
  cache: cache,
  coroutine: coroutine,
  dirichletERP: dirichletERP,
  discreteERP: discreteERP,
  display: display,
  erpFactor: erpFactor,
  exponentialERP: exponentialERP,
  factor: factor,
  gammaERP: gammaERP,
  gaussianERP: gaussianERP,
  gaussianFactor: gaussianFactor,
  getAddress: getAddress,
  globalStore: globalStore,
  multinomialSample: multinomialSample,
  poissonERP: poissonERP,
  randomIntegerERP: randomIntegerERP,
  sample: sample,
  sampleWithFactor: sampleWithFactor,
  uniformERP: uniformERP,
  util: util,
  withEmptyStack: withEmptyWebPPLStack
};
