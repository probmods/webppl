'use strict';

var _ = require('underscore');
var assert = require('assert');
var ERP = require('./erp.js').ERP;

var Trace = function() {
  this.choices = [];
  this.length = 0;
  this.score = 0;
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

Trace.prototype.addChoice = function(erp, params, value, address, store, continuation, reuse) {
  // Called at sample statements.
  // Adds the choice to the DB and updates current score.

  assert(erp instanceof ERP);
  assert(_.isArray(params));
  assert(_.isString(address));
  assert(_.isObject(store));
  assert(_.isFunction(continuation));

  // Record the score before adding the choiceScore. This is the score we'll
  // need if we regen from this choice.

  var choiceScore = erp.score(params, value);

  this.choices.push({
    k: continuation,
    name: address,
    erp: erp,
    params: params,
    score: this.score,
    choiceScore: choiceScore,
    val: value,
    s: _.clone(store),
    reused: reuse // TODO: MH specific. OK, or store elsewhere?
  });

  this.length += 1;
  this.score += choiceScore;
};

Trace.prototype.complete = function(value) {
  // Called at coroutine exit.
  // value: The final value of the program.
  this.value = value;
  // TODO: Maybe reset k & store to prevents attempts to continue a complete trace.
};

Trace.prototype.map = function(f) {
  return this.choices.map(f);
};

Trace.prototype.upto = function(i) {
  // We never take all choices as we don't include the choice we're regenerating
  // from.
  assert(i < this.length);

  var t = new Trace();
  t.choices = this.choices.slice(0, i);
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
