'use strict';

var _ = require('underscore');
var assert = require('assert');
var ERP = require('./erp.js').ERP;

var Trace = function() {
  this.choices = [];
  this.addressMap = {}; // Maps addresses => choices.
  this.length = 0;
  this.score = 0;
};

Trace.prototype.choiceAtIndex = function(index) {
  return this.choices[index];
};

Trace.prototype.findChoice = function(address) {
  return this.addressMap[address];
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

  var choice = {
    k: continuation,
    name: address,
    erp: erp,
    params: params,
    score: this.score,
    choiceScore: choiceScore,
    val: value,
    s: _.clone(store),
    reused: reuse // TODO: MH specific. OK, or store elsewhere?
  };

  this.choices.push(choice);
  this.addressMap[address] = choice;
  this.length += 1;
  this.score += choiceScore;
  this.cc();
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
  t.choices.forEach(function(choice) { t.addressMap[choice.name] = choice; });
  t.length = t.choices.length;
  t.score = this.choices[i].score;
  t.cc();
  return t;
};

Trace.prototype.copy = function() {
  var t = new Trace();
  t.choices = this.choices.slice(0);
  t.addressMap = _.clone(this.addressMap);
  t.length = this.length;
  t.score = this.score;
  t.k = this.k;
  t.store = _.clone(this.store);
  t.value = this.value;
  t.cc();
  return t;
};

Trace.prototype.cc = function() {
  assert(this.choices.length === this.length);
  assert(_.keys(this.addressMap).length === this.length);
  this.choices.forEach(function(choice) {
    assert(_.has(this.addressMap, choice.name));
  }, this);
};

module.exports = {
  Trace: Trace
};
