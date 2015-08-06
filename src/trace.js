/** A Trace (and proposal) data-structure library **/

var _clone = require('underscore').clone;

// Trace Entry

function TraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preChoiceScore, postChoiceScore) {
  this.store = s;
  this.continuation = k;
  this.address = a;
  this.erp = erp;
  this.erpParams = erpParams;
  this.erpScore = erpScore;
  this.erpValue = erpValue;
  this.preChoiceScore = preChoiceScore;
  this.postChoiceScore = postChoiceScore;
}

TraceEntry.prototype.isContinuous = function() {
  return this.erp ? this.erp.isContinuous() : false;
};

function makeTraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preChoiceScore, postChoiceScore) {
  return new TraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preChoiceScore, postChoiceScore);
}

// Trace

function Trace() {
  this.trace = [];
}
Trace.prototype.addressIndices = undefined; // only for erps, not factors
Trace.prototype.scoreUpdaterF = function(a, b) { return a + b };
Trace.prototype.score = function() {
  var len = this.trace.length;
  return len > 0 ? this.trace[len - 1].postChoiceScore : 0;
};
Trace.prototype.append = function(s, k, a, erp, erpParams, score, erpValue) {
  this.trace.push(makeTraceEntry(s, k, a, erp, erpParams, score, erpValue,
                                 this.score(),
                                 this.scoreUpdaterF(this.score(), score)));
  if (erp) this.addressIndices[a] = this.trace.length - 1;
};
Trace.prototype.forEach = function(f) { this.trace.forEach(f); };
// this keeps ad references, but ensures that the clone doesn't modify the original
Trace.prototype.clone = function(scorer) {
  var newTrace = new Trace();
  if (scorer !== undefined) newTrace.scoreUpdaterF = scorer;
  newTrace.trace = this.trace.slice();
  newTrace.addressIndices = JSON.parse(JSON.stringify(this.addressIndices));
  return newTrace;
};
Trace.prototype.startFrom = 0;
Trace.prototype.fwdLP = 0;
Trace.prototype.rvsLP = 0;
Trace.prototype.length = function() {
  return this.trace.length;
};
Trace.prototype.indexOf = function(address) {
  return this.addressIndices[address];
}
Trace.prototype.lookupAt = function(index) {
  return this.trace[index];
}
Trace.prototype.lookup = function(address) {
  var index = this.addressIndices[address];
  return index ? this.trace[index] : undefined;
}

function makeTrace() {
  return new Trace();
}

// Proposal

function Proposal(value) {
  this.value = value;
}
Proposal.prototype.update = function() { // dummy
  return this.value;
};

function makeGradProposal(value, gradient) {
  var p = new Proposal(value)
  p.gradient = gradient;
  p.update = function(f, stepSize) {
    return this.value + (stepSize * f(this.gradient));
  }
  return p;
}

function makeHMCProposal(value, gradient, moment) {
  var p = new Proposal(value)
  p.gradient = gradient;
  p.moment = moment;
  p.update = function(stepSize) {
    return this.value + (stepSize * this.moment);
  }
  return p;
}

function makeMHProposal(value, erp, erpParams) {
  var p = new Proposal(value)
  p.erp = erp;
  p.erpParams = erpParams;
  p.update = function() {return this.erp.sample(this.erpParams);};
  return p;
}

// Particle

function Particle() {
  this.store = undefined;
  this.continuation = undefined;
  this.value = undefined;
  this.weight = 0;
  this.trace = undefined;
  this.active = true;
}
Particle.prototype.deactivate = function() {
  this.active = false;
};
Particle.prototype.update = function(s, k, a, erp, erpParams, score, weight, erpValue) {
  this.continuation = k;
  this.store = s;
  this.weight += weight;        // doesn't need ad
  this.trace.append(s, k, a, erp, erpParams, score, erpValue);
};
Particle.prototype.clone = function(scorer) {
  var newParticle = makeParticle(this.weight);
  newParticle.store = _clone(this.store);
  newParticle.continuation = this.continuation;
  newParticle.value = this.value
  newParticle.trace = this.trace.clone(scorer)
  newParticle.active = this.active
  return newParticle;
};
Particle.prototype.score = function() {
  return this.trace === undefined ? 0 : this.trace.score();
};
Particle.prototype.resume = function() {
  return this.continuation(this.store);
};

function makeParticle(scorer) {
  var p = new Particle();
  p.trace = makeTrace();
  if (scorer) p.trace.scoreUpdaterF = scorer;
  return p;
}

function initParticle(s, k, traceScorer) {
  var p = new Particle();
  p.store = s;
  p.continuation = k;
  p.trace = makeTrace();
  p.trace.addressIndices = {};
  if (traceScorer) p.trace.scoreUpdaterF = traceScorer;
  return p;
}

module.exports = {
  makeTrace: makeTrace,
  makeGradProposal: makeGradProposal,
  makeHMCProposal: makeHMCProposal,
  makeMHProposal: makeMHProposal,
  initParticle: initParticle
};
