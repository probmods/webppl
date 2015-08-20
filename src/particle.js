'use strict';

var _ = require('underscore');
var assert = require('assert');

// Minimal Trace-like structure used to avoid unnecessary overhead in SMC
// without rejuvenation.

var Particle = function() {
  this.score = 0;
  this.logWeight = 0; // Importance weight.
};

Particle.prototype.saveContinuation = function(continuation, store) {
  this.k = continuation;
  this.store = store;
};

Particle.prototype.addChoice = function(erp, params, val, address, store, continuation) {
  this.score += erp.score(params, val);
};

Particle.prototype.complete = function(value) {
  // Called at coroutine exit.
  assert(this.value === undefined);
  this.value = value;
  // Ensure any attempt to continue a completed Particle fails in an obvious way.
  this.k = this.store = undefined;
};

Particle.prototype.copy = function() {
  var t = new Particle();
  t.score = this.score;
  t.k = this.k;
  t.store = _.clone(this.store);
  t.value = this.value;
  return t;
};

module.exports = Particle;
