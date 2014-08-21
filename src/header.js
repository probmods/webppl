"use strict";

var _ = require('underscore');
var PriorityQueue = require('priorityqueuejs');
var util = require('./util.js');

//top address for naming
var address = ""

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
    var stop = params[0];
    var val = Math.floor(Math.random() * stop);
    return val;
  },
  function randomIntegerScore(params, val) {
    var stop = params[0];
    var inSupport = (val == Math.floor(val)) && (0 <= val) && (val < stop);
    return inSupport ? -Math.log(stop) : -Infinity;
  },
  function randomIntegerSupport(params) {
    var stop = params[0];
    return _.range(stop);
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

function gaussianFactor(k, mu, std, val) {
  coroutine.factor(k, gaussianScore([mu, std], val));
}

var gaussianERP = new ERP(gaussianSample, gaussianScore);

var discreteERP = new ERP(
  function discreteSample(params){return multinomialSample(params[0])},
  function discreteScore(params, val) {
    var probs = params[0];
    var stop = probs.length;
    var inSupport = (val == Math.floor(val)) && (0 <= val) && (val < stop);
    return inSupport ? Math.log(probs[val]) : -Infinity;
  },
  function discreteSupport(params) {
    return _.range(params[0].length);
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
  var norm = 0,
  supp = [];
  for (var v in marginal) {
    norm += marginal[v].prob;
    supp.push(marginal[v].val);
  }
  for (var v in marginal) {
    marginal[v].prob = marginal[v].prob / norm;
  }

  console.log("Creating distribution: ");
  console.log(marginal);

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
//                     if(marginal[i].val == val){return Math.log(marginal[i].prob)}
                     if(i == JSON.stringify(val)){return Math.log(marginal[i].prob)}
                     }
                     return -Infinity
    },
    function(params) {
      return supp;
    });
  return dist;
}


// Inference interface: an inference function takes the current
// continuation and a WebPPL thunk (which itself has been transformed
// to take a continuation). It does some kind of inference and returns
// an ERP representing the nromalized marginal distribution on return
// values.
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
  sample: function(cc, a, erp, params) {
    // Sample and keep going
    cc(erp.sample(params));
  },
  factor: function() {
    throw "factor allowed only inside inference.";
  },
  exit: function(r) {
    return r;
  }
};

// Functions that call methods of whatever the coroutine is set to
// when called, we do it like this so that 'this' will be set
// correctly to the coroutine object.
function sample(k, a, dist, params) {
  coroutine.sample(k, a, dist, params);
}

function factor(k, a, score) {
  coroutine.factor(k, a, score);
}

function sampleWithFactor(k, a, dist, params, scoreFn) {
  if(coroutine.hasOwnProperty('sampleWithFactor')){
    coroutine.sampleWithFactor(k, dist, params, scoreFn)
  } else {
    sample(function(v){
           scoreFn(function(s){factor(function(){k(v)},s)}, v)},
           dist, params)
  }
}

function exit(retval) {
  coroutine.exit(retval);
}


//////////////////////////////////////////////////////////////////////
//// Forward sampling
////
//// Simply samples at each random choice. throws an error on factor,
//// since we aren't doing any normalization / inference.
//
//function Forward(cc, wpplFn) {
//  this.cc = cc;
//
//  // Move old coroutine out of the way and install this as the
//  // current handler.
//  this.oldCoroutine = coroutine;
//  coroutine = this;
//
//  // Run the wppl computation, when the computation returns we want
//  // it to call the exit method of this coroutine so we pass that as
//  // the continuation.
//  wpplFn(exit);
//}
//
//Forward.prototype.sample = function(cc, erp, params) {
//  cc(erp.sample(params)); //sample and keep going
//};
//
//Forward.prototype.factor = function(cc, score) {
//  throw "'factor' is not allowed inside Forward.";
//};
//
//Forward.prototype.exit = function(retval) {
//  // Return value of the wppl fn as a delta erp
//  var dist = new ERP(
//    function() {
//      return retval;
//    },
//    function(p, v) {
//      return (v == retval) ? 0 : -Infinity;
//    });
//
//  // Put old coroutine back, and return dist
//  coroutine = this.oldCoroutine;
//  this.cc(dist);
//};
//
//// Helper wraps with 'new' to make a new copy of Forward and set
//// 'this' correctly..
//function fw(cc, wpplFn) {
//  return new Forward(cc, wpplFn);
//}


////////////////////////////////////////////////////////////////////
// Enumeration
//
// Depth-first enumeration of all the paths through the computation.
// Q is the queue object to use. It should have enq, deq, and size methods.

function Enumerate(k, a, wpplFn, maxExecutions, Q) {

  this.score = 0; // Used to track the score of the path currently being explored
  this.queue = Q; // Queue of states that we have yet to explore
  this.marginal = {}; // We will accumulate the marginal distribution here
  this.numCompletedExecutions = 0;
  this.maxExecutions = maxExecutions || 1000;

  // Move old coroutine out of the way and install this as the current handler
  this.k = k;
  this.oldCoroutine = coroutine;
  coroutine = this;

  // Run the wppl computation, when the computation returns we want it
  // to call the exit method of this coroutine so we pass that as the
  // continuation.
  wpplFn(exit,a);
}


// The queue is a bunch of computation states. each state is a
// continuation, a value to apply it to, and a score.
//
// This function runs the highest priority state in the
// queue. Currently priority is score, but could be adjusted to give
// depth-first or breadth-first or some other search strategy

Enumerate.prototype.nextInQueue = function() {
  var nextState = this.queue.deq();
  this.score = nextState.score;
  util.withEmptyStack(function(){nextState.continuation(nextState.value)});
//  nextState.continuation(nextState.value)
};


Enumerate.prototype.sample = function(cc, a, dist, params, extraScoreFn) {

  //allows extra factors to be taken into account in making exploration decisions:
  var extraScoreFn = extraScoreFn || function(x){return 0}

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
      score: this.score + dist.score(params, supp[s]) + extraScoreFn(supp[s])
    };

    this.queue.enq(state);
  }
  // Call the next state on the queue
  this.nextInQueue();
};

Enumerate.prototype.factor = function(cc,a, score) {
  // Update score and continue
  this.score += score;
  cc();
};

Enumerate.prototype.sampleWithFactor = function(cc,a,dist,params,scoreFn) {
  Enumerate.sample(cc,dist,params, function(v){return scoreFn(function(x){return x},v)})
}

Enumerate.prototype.exit = function(retval) {

  // We have reached an exit of the computation. Accumulate probability into retval bin.
  var r = JSON.stringify(retval)
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
    // Return from enumeration by calling original continuation:
    this.k(dist);
  }
};


//helper wraps with 'new' to make a new copy of Enumerate and set 'this' correctly..
function enuPriority(cc, a, wpplFn, maxExecutions) {
  var q = new PriorityQueue(function(a, b){return a.score-b.score;});
  return new Enumerate(cc,a, wpplFn, maxExecutions, q);
}

function enuFilo(cc,a, wpplFn, maxExecutions) {
  var q = []
  q.size = function(){return q.length}
  q.enq = q.push
  q.deq = q.pop
  return new Enumerate(cc,a, wpplFn, maxExecutions, q);
}

function enuFifo(cc,a, wpplFn, maxExecutions) {
  var q = []
  q.size = function(){return q.length}
  q.enq = q.push
  q.deq = q.shift
  return new Enumerate(cc,a, wpplFn, maxExecutions, q);
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
    value: particle.value
  };
}

function ParticleFilter(k,a, wpplFn, numParticles) {

  this.particles = [];
  this.particleIndex = 0;  // marks the active particle

  // Create initial particles
  for (var i=0; i<numParticles; i++) {
    var particle = {
      continuation: function(){wpplFn(exit,a);},
      weight: 0,
      value: undefined
    };
    this.particles.push(particle);
  }

  // Move old coroutine out of the way and install this as the current
  // handler.
  this.k = k;
  this.oldCoroutine = coroutine;
  coroutine = this;

  // Run first particle
  this.activeParticle().continuation();
}

ParticleFilter.prototype.sample = function(cc,a, erp, params) {
  cc(erp.sample(params));
};

ParticleFilter.prototype.factor = function(cc,a, score) {
  // Update particle weight
  this.activeParticle().weight += score;
  this.activeParticle().continuation = cc;

  if (this.allParticlesAdvanced()){
    // Resample in proportion to weights
    this.resampleParticles();
    this.particleIndex = 0;
  } else {
    // Advance to the next particle
    this.particleIndex += 1;
  }

  util.withEmptyStack(this.activeParticle().continuation);
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
  var W = util.logsumexp(_.map(this.particles, function(p){return p.weight}));

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

ParticleFilter.prototype.exit = function(retval) {

  this.activeParticle().value = retval;

  // Wait for all particles to reach exit before computing
  // marginal distribution from particles
  if (!this.allParticlesAdvanced()){
    this.particleIndex += 1;
    return this.activeParticle().continuation();
  }

  // Compute marginal distribution from (unweighted) particles
  var hist = {};
  _.each(
    this.particles,
    function(particle){
         var k = JSON.stringify(particle.value)
         if(hist[k]==undefined){hist[k]={prob:0, val:particle.value}}
         hist[k].prob += 1;
    });
  var dist = makeMarginalERP(hist);

  // Reinstate previous coroutine:
  coroutine = this.oldCoroutine;

  // Return from particle filter by calling original continuation:
  this.k(dist);
};

function pf(cc, a, wpplFn, numParticles) {
  return new ParticleFilter(cc,a, wpplFn, numParticles);
}

////////////////////////////////////////////////////////////////////
// Lightweight MH

function MH(k, a, wpplFn, numIterations) {

  this.trace = {}
  this.score = 0
  var sample
  var hist = {};
  this.fwbw = 0
  
  // Move old coroutine out of the way and install this as the current
  // handler.
  this.oldCoroutine = coroutine;
  coroutine = this;
  
  //kick off computation, with trivial continuation that will come back here.
  //this initializes and store choices in trace. each choice has trivial final k, too.
  var retval
  wpplFn(function(x){retval = x},a)
  sample = retval
  
  //now we've initialized, run the MH loop:
  for(var i=0;i<numIterations;i++){
    this.fwbw = 0
    
    //choose choice from trace..
    var keys = traceKeys(this.trace)
    var key = keys[Math.floor(Math.random() * keys.length)]
    var choice = this.trace[key]
    this.fwbw += Math.log(keys.length)
    
    //sample new value for the chosen choice
    var newval = choice.erp.sample(choice.params)
    //note proposal prob and score cancel, when drawn from prior.
//    this.fwbw += choice.erp.score(choice.params,choice.val) -
//                  choice.erp.score(choice.params,newval)
    
    //copy and move current trace out of the way, update by re-entering at the choice.
    var oldTrace = this.trace
    this.trace = copyTrace(oldTrace)
    var oldscore = this.score
    this.score = 0
    this.trace[key].val = newval
    choice.k(newval) //run continuation, will set retval at end.
    
    //compute acceptance prob and decide
    this.fwbw += this.score - oldscore
    this.fwbw += -Math.log(traceKeys(this.trace).length)
    //TODO clear out unused choices...!!!
    var acceptanceProb = Math.min(1,Math.exp(this.fwbw))
    var accept = Math.random()<acceptanceProb
    this.trace = accept?this.trace:oldTrace
    sample= accept?retval:sample
    this.score = accept?this.score:oldscore
 
    //accumulate sample into hist:
    var v = JSON.stringify(sample)
    if(hist[v]==undefined){hist[v]={prob:0, val:sample}}
    hist[v].prob += 1;
  }
  
  // Reinstate previous coroutine:
  coroutine = this.oldCoroutine;
  
  // Return by calling original continuation:
  k(makeMarginalERP(hist));
}

MH.prototype.sample = function(cc, add, erp, params) {
  //TODO accumulate fw/bw prob on creation!!!
  //TODO check for param change
  if(this.trace[add]==undefined){
    var val = erp.sample(params)
    this.trace[add] = {val: val, erp: erp, params: params, k: cc, add:add}
    cc(val);
  } else {
    cc(this.trace[add].val)
  }
};

MH.prototype.factor = function(cc, add, score) {
  this.score += score
  cc()
}

function copyTrace(trace) {
  var newTrace = {}
  for(var v in trace){
    newTrace[v] = trace[v]
  }
  return newTrace
}

function traceKeys(trace){
  var keys = []
  for(var k in trace){
    if(trace.hasOwnProperty(k)){keys.push(k)}
  }
  return keys
}

function mh(cc, a, wpplFn, numParticles) {
  return new MH(cc, a, wpplFn, numParticles);
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

module.exports = {
  ERP: ERP,
  bernoulliERP: bernoulliERP,
  randomIntegerERP: randomIntegerERP,
  gaussianERP: gaussianERP,
  gaussianFactor: gaussianFactor,
  uniformERP: uniformERP,
  discreteERP: discreteERP,
//  Forward: fw,
  Enumerate: enuPriority,
  EnumerateLikelyFirst: enuPriority,
  EnumerateDepthFirst: enuFilo,
  EnumerateBreadthFirst: enuFifo,
  ParticleFilter: pf,
MH: mh,
  //coroutine: coroutine,
address: address,
  sample: sample,
  factor: factor,
  sampleWithFactor: sampleWithFactor,
  display: display,
//  callPrimitive: callPrimitive,
  cache: cache,
  multinomialSample: multinomialSample
};
