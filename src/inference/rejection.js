// Rejection sampling
//
// Rejection sampling requires an upper bound on the total factor
// score per execution (easiest is 0, with restriction to negative
// factor values).

'use strict';

var erp = require('../erp.js');


module.exports = function(env) {

  function Rejection(s, k, a, wpplFn, numSamples, maxScore) {
    this.s = s;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.maxScore = maxScore;
    this.hist = {};
    this.numSamples = numSamples;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
  }

  Rejection.prototype.run = function() {
    this.logUniform = Math.log(Math.random());
    this.scoreSoFar = 0;
    return this.wpplFn(_.clone(this.s), env.exit, this.a);
  }

  Rejection.prototype.sample = function(s, k, a, erp, params) {
    return k(s, erp.sample(params));
  };

  Rejection.prototype.factor = function(s, k, a, score) {
    this.scoreSoFar += score;
    if ((this.scoreSoFar - this.maxScore) <= this.logUniform) {
      // reject
      console.log('reject');
      return this.run();
    } else {
      // continue
      return k(s);
    }
  }

  Rejection.prototype.exit = function(s, retval) {
    if (this.hist[retval] === undefined) {
      this.hist[retval] = {prob: 0, val: retval};
    }
    this.hist[retval].prob += 1;
    this.numSamples -= 1;
    if (this.numSamples === 0) {
      var dist = erp.makeMarginalERP(this.hist);
      env.coroutine = this.oldCoroutine;
      return this.k(this.s, dist);
    } else {
      return this.run();
    }
  }

  function rej(s, k, a, wpplFn, numSamples, maxScore) {
    return new Rejection(s, k, a, wpplFn, numSamples, maxScore).run();
  }

  return {
    Rejection: rej
  };

};
