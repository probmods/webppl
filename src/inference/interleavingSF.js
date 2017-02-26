// Check if the script has interleaving samples and factors
// return true/false

'use strict';

module.exports = function(env) {

  function InterleavingSF(s, k, a, wpplFn) {
    this.hasFactor = false;
    this.interleavingSampleFactor = false;

    this.s = s;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  InterleavingSF.prototype.run = function() {
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  };

  InterleavingSF.prototype.sample = function(s, k, a, dist) {
    if (this.hasFactor) {
      this.interleavingSampleFactor = true;
    }
    return k(s);
  };

  InterleavingSF.prototype.factor = function(s, k, a, score) {
    if (!this.hasFactor) {
      this.hasFactor = true;
    }
    return k(s);
  };

  InterleavingSF.prototype.exit = function(s, retval) {
    this.k(this.s, this.interleavingSampleFactor);
  };

  function check(s, k, a, wpplFn) {
    return new InterleavingSF(s, k, a, wpplFn).run();
  }

  return {
    InterleavingSF: check
  };

};