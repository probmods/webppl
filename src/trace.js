'use strict';

var _ = require('underscore');
var assert = require('assert');

var Trace = function() {
  this.choices = [];
  this.addressMap = {}; // Maps addresses => choices.
  this.length = 0;
  this.score = 0;
  this.logWeight = 0; // Importance weight.
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

// TODO: Re-use the version from ERP module once available.
var isErp = function(erp) {
  return _.every(['sample', 'score'], function(property) {
    return _.isFunction(erp[property]);
  });
};

Trace.prototype.addChoice = function(erp, params, value, address, store, continuation) {
  // Called at sample statements.
  // Adds the choice to the DB and updates current score.

  assert(isErp(erp));
  assert(_.isUndefined(params) || _.isArray(params));
  assert(_.isString(address));
  assert(_.isObject(store));
  assert(_.isFunction(continuation));

  var choice = {
    k: continuation,
    name: address,
    erp: erp,
    params: params,
    // Record the score without adding the choiceScore. This is the score we'll
    // need if we regen from this choice.
    score: this.score,
    val: value,
    s: _.clone(store)
  };

  this.choices.push(choice);
  this.addressMap[address] = choice;
  this.length += 1;
  this.score += erp.score(params, value);
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
  t.logWeight = this.logWeight;
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
