/** A Trace (and proposal) data-structure library **/

// Trace Entry

function TraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preTraceScore, postTraceScore) {
  this.store = s;
  this.continuation = k;
  this.address = a;
  this.erp = erp;
  this.erpParams = erpParams;
  this.erpScore = erpScore;
  this.erpValue = erpValue;
  this.preTraceScore = preTraceScore;
  this.postTraceScore = postTraceScore;
}

TraceEntry.prototype.isContinuous = function() {
  return this.erp ? this.erp.isContinuous() : false;
};

function makeTraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preTraceScore, postTraceScore) {
  return new TraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preTraceScore, postTraceScore);
}

// Trace

function Trace() {
  this.trace = [];
}
Trace.prototype.addressIndices = undefined; // only for erps, not factors
Trace.prototype.scoreUpdaterF = function(a, b) { return a + b };
Trace.prototype.score = function() {
  var len = this.trace.length;
  return len > 0 ? this.trace[len - 1].postTraceScore : 0;
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
  newTrace.scoreUpdaterF = scorer;
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

// Proposals

module.exports = {
  makeTrace: makeTrace,
  makeGradProposal: makeGradProposal,
  makeHMCProposal: makeHMCProposal,
  makeMHProposal: makeMHProposal
};
