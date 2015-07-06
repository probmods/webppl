'use strict';

var _ = require('underscore');
var assert = require('assert');
var ERP = require('./erp.js').ERP;

var Trace = function(continuation, store) {
  this.choices = [];
  this.length = 0;

  // Running score. Updated at both factor and sample.
  this.score = 0;

  // TODO: Perhaps extract a method for this an only call where required.
  // Used to suspend/resume (partial) traces. (Used by particle methods?)
  this.k = continuation;
  this.store = store;
};

Trace.prototype.choiceAtIndex = function(index) {
  return this.choices[index];
};

Trace.prototype.findChoice = function(address) {
  for (var i = 0; i < this.choices.length; i++) {
    if (this.choices[i].name === address) return this.choices[i];
  }
};

Trace.prototype.saveContinuation = function(continuation, store) {
  this.k = continuation;
  // Caller is currently expected to clone if necessary.
  // TODO: Do all callers clone?
  this.store = store;
};

Trace.prototype.addChoice = function(erp, params, value, score, address, store, continuation, reuse) {
  // Called at sample statements.
  // Adds the choice to the DB and update current score.
  // score == erp.score(params, value)

  assert(erp instanceof ERP);
  assert(_.isArray(params));
  assert(_.isNumber(score));
  assert(_.isString(address));
  assert(_.isObject(store));
  assert(_.isFunction(continuation));

  this.choices.push({
    k: continuation,
    name: address,
    erp: erp,
    params: params,
    score: this.score, // Record the score before adding the score for value.
    choiceScore: score,
    val: value,
    s: _.clone(store),
    reused: reuse // TODO: MH specific. OK, or store elsewhere?
  });
  this.length += 1;
  this.score += score;
};

Trace.prototype.complete = function(value) {
  this.value = value;
  // TODO: Maybe reset k & store to prevents attempts to continue a complete trace.
};

Trace.prototype.map = function(f) {
  return this.choices.map(f);
};

Trace.prototype.upto = function(i) {
  // Taking *all* choices would require setting the score from trace.score (I
  // think) as there are no subsequent choices. But I'll not allow it for now as
  // I don't think we need it.
  assert(i < this.length);

  var t = new Trace();
  t.choices = this.choices.slice(0, i);

  // Set additonal properties to consistent state.
  t.length = t.choices.length;
  t.score = this.choices[i].score;

  return t;
};

Trace.prototype.copy = function() {
  var t = new Trace();
  t.choices = this.choices.slice(0);
  t.length = this.length;
  t.score = this.score;
  t.k = this.k;
  t.store = _.clone(this.store);
  t.value = this.value;
  return t;
},


module.exports = {
  Trace: Trace
};
