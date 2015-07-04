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
}

function makeTraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preTraceScore, postTraceScore) {
  return new TraceEntry(s, k, a, erp, erpParams, erpScore, erpValue, preTraceScore, postTraceScore);
}

// Trace

function Trace() {
  this.trace = [];
}

Trace.prototype.scoreUpdaterF = function(a, b) { return a + b };

Trace.prototype.score = function() {
  var len = this.trace.length;
  return len > 0 ? this.trace[len - 1].postTraceScore : 0;
}

Trace.prototype.append = function(s, k, a, erp, erpParams, score, erpValue) {
  this.trace.push(makeTraceEntry(s, k, a, erp, erpParams, score, erpValue,
                                 this.score(),
                                 this.scoreUpdaterF(this.score(), score)));
}

Trace.prototype.length = function() { return this.trace.length; }

Trace.prototype.forEach = function(f) { this.trace.forEach(f); }

// this keeps ad references, but ensures that the clone doesn't modify the original
Trace.prototype.clone = function(scorer) {
  var newTrace = makeTrace();
  newTrace.scoreUpdaterF = scorer;
  newTrace.trace = this.trace.slice();
  return newTrace;
}

function makeTrace() {
  return new Trace();
}

// Proposal

function Proposal(value) {
  this.value = value;
}
Proposal.prototype.gradient = undefined;
Proposal.prototype.moment = undefined;

function makeProposal(value, gradient, moment) {
  var p = new Proposal(value)
  if (gradient !== undefined) p.gradient = gradient;
  if (moment !== undefined) p.moment = moment;
  return p;
}

module.exports = {
  makeTrace: makeTrace,
  makeProposal: makeProposal
}
