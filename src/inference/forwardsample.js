////////////////////////////////////////////////////////////////////
// Forward sample

'use strict';

var _ = require('underscore');
var erp = require('../erp.js');

module.exports = function(env) {

  function ForwardSample(store, k, a, wpplFn, numSamples) {
    this.numSamples = numSamples;
    this.numCompletedSamples = 0;
    this.returnHist = {};
    this.store = store;
    this.k = k;
    this.a = a;
    this.wpplFn = wpplFn;
    this.coroutine = env.coroutine;
    env.coroutine = this;
  }

  ForwardSample.prototype.sample = function(s, k, a, erp, params) {
    return k(s, erp.sample(params));
  };

  ForwardSample.prototype.run = function() {
    return this.wpplFn(_.clone(this.store), env.exit, this.a);
  };

  ForwardSample.prototype.exit = function(s, retval) {
    var r = JSON.stringify(retval);
    if (this.returnHist[r] === undefined) {
      this.returnHist[r] = { prob: 0, val: retval };
    }
    this.returnHist[r].prob += 1;
    this.numCompletedSamples++;

    if (this.numCompletedSamples < this.numSamples) {
      return this.run();
    }

    var dist = erp.makeMarginalERP(this.returnHist);
    env.coroutine = this.coroutine;
    return this.k(this.store, dist);
  };

  return {
    ForwardSample: function(s, cc, a, wpplFn, numSamples) {
      return new ForwardSample(s, cc, a, wpplFn, numSamples).run();
    }
  };

};
