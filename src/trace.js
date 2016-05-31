'use strict';

var _ = require('underscore');
var assert = require('assert');
var isDist = require('./dists').isDist;
var ad = require('./ad');

var Trace = function(wpplFn, s, k, a) {
  // The program we're doing inference in, and the store, continuation
  // and address required to run it.
  this.wpplFn = wpplFn;
  this.initialStore = s;
  this.exitK = k; // env.exit
  this.baseAddress = a;

  this.choices = [];
  this.addressMap = {}; // Maps addresses => choices.
  this.length = 0;
  this.score = 0;
  this.numFactors = 0; // The number of factors encountered so far.
  // this.checkConsistency();
};

Trace.prototype.fresh = function() {
  // Create a new trace using wpplFn etc. from this Trace.
  return new Trace(this.wpplFn, this.initialStore, this.exitK, this.baseAddress);
};

Trace.prototype.choiceAtIndex = function(index) {
  return this.choices[index];
};

Trace.prototype.findChoice = function(address) {
  return this.addressMap[address];
};

Trace.prototype.saveContinuation = function(s, k) {
  this.store = s;
  this.k = k;
  // this.checkConsistency();
};

Trace.prototype.continue = function() {
  // If saveContinuation has been called continue, otherwise run from
  // beginning.
  if (this.k && this.store) {
    return this.k(this.store);
  } else {
    return this.wpplFn(_.clone(this.initialStore), this.exitK, this.baseAddress);
  }
};

Trace.prototype.addChoice = function(dist, val, address, store, continuation) {
  // Called at sample statements.
  // Adds the choice to the DB and updates current score.

  // assert(isDist(dist));
  // assert(_.isString(address));
  // assert(_.isObject(store));
  // assert(_.isFunction(continuation));

  var choice = {
    k: continuation,
    address: address,
    dist: dist,
    // Record the score without adding the choiceScore. This is the score we'll
    // need if we regen from this choice.
    score: this.score,
    val: val,
    store: _.clone(store),
    numFactors: this.numFactors
  };

  this.choices.push(choice);
  this.addressMap[address] = choice;
  this.length += 1;
  this.score = ad.scalar.add(this.score, dist.score(val));
  // this.checkConsistency();
};

Trace.prototype.complete = function(value) {
  // Called at coroutine exit.
  assert.strictEqual(this.value, undefined);
  this.value = value;
  // Ensure any attempt to continue a completed trace fails in an obvious way.
  this.k = this.store = undefined;
};

Trace.prototype.isComplete = function() {
  return this.k === undefined && this.store === undefined;
};

Trace.prototype.upto = function(i) {
  // We never take all choices as we don't include the choice we're regenerating
  // from.
  assert(i < this.length);

  var t = this.fresh();
  t.choices = this.choices.slice(0, i);
  t.choices.forEach(function(choice) { t.addressMap[choice.address] = choice; });
  t.length = t.choices.length;
  t.score = this.choices[i].score;
  t.numFactors = this.choices[i].numFactors;
  // t.checkConsistency();
  return t;
};

Trace.prototype.copy = function() {
  var t = this.fresh();
  t.choices = this.choices.slice(0);
  t.addressMap = _.clone(this.addressMap);
  t.length = this.length;
  t.score = this.score;
  t.k = this.k;
  t.store = _.clone(this.store);
  t.address = this.address;
  t.value = this.value;
  t.numFactors = this.numFactors;
  // t.checkConsistency();
  return t;
};

Trace.prototype.checkConsistency = function() {
  assert(_.isFunction(this.wpplFn));
  assert(_.isFunction(this.exitK));
  assert(this.initialStore);
  assert(this.baseAddress);
  assert(this.k && this.store || !this.k && !this.store);
  assert(this.choices.length === this.length);
  assert(_.keys(this.addressMap).length === this.length);
  this.choices.forEach(function(choice) {
    assert(_.has(this.addressMap, choice.address));
  }, this);
  assert(this.value === undefined || (this.k === undefined && this.store === undefined));
};

module.exports = Trace;
