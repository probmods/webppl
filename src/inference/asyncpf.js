////////////////////////////////////////////////////////////////////
// Asynchronous Anytime SMC.
// http://arxiv.org/abs/1407.2864
// bufferSize: queue size
// numParticles: total number of particles to run

'use strict';

var _ = require('underscore');
var util = require('../util.js');
var erp = require('../erp.js');

module.exports = function(env) {

  function copyOneParticle(particle) {
    return {
      continuation: particle.continuation,
      weight: particle.weight,
      completed: particle.completed,
      factorIndex: particle.factorIndex,
      value: particle.value,
      numChildrenToSpawn: 1,
      multiplicity: particle.multiplicity,
      store: _.clone(particle.store)
    };
  }

  function initParticle(s, cont) {
    return {
      continuation: cont,
      weight: 0,
      completed: false,
      factorIndex: undefined,
      value: undefined,
      numChildrenToSpawn: 0,
      multiplicity: 1,
      store: _.clone(s)
    };
  }

  function AsyncPF(s, k, a, wpplFn, numParticles, bufferSize) {
    this.numParticles = 0;      // K_0 -- initialized here, set in run
    this.bufferSize = bufferSize == undefined ? numParticles : bufferSize; // \rho
    this.initNumParticles = Math.floor(this.bufferSize * (1 / 2));         // \rho_0
    this.exitK = function(s) {return wpplFn(s, env.exit, a);};
    this.store = s;
    this.buffer = [];
    for (var i = 0; i < this.initNumParticles; i++) {
      this.buffer.push(initParticle(this.store, this.exitK));
    }

    this.obsWeights = {};
    this.exitedParticles = 0;
    this.hist = {};

    // Move old coroutine out of the way and install this as current handler.
    this.k = k;
    this.oldCoroutine = env.coroutine;
    env.coroutine = this;
    this.oldStore = _.clone(s); // will be reinstated at the end
  };

  AsyncPF.prototype.run = function(numP) {
    // allows for continuing pf
    this.numParticles = (numP == undefined) ? this.numParticles : this.numParticles + numP;

    // launch a new particle OR continue an existing one
    var p, launchP;
    var i = Math.floor((this.buffer.length + 1) * Math.random());
    if (i == this.buffer.length) { // generate new particle
      p = initParticle(this.store, this.exitK);
    } else {                    // launch particle in queue
      launchP = this.buffer[i];
      if (launchP.numChildrenToSpawn > 1) {
        p = copyOneParticle(launchP);
        launchP.numChildrenToSpawn -= 1;
      } else {
        p = launchP;
        this.buffer = util.deleteIndex(this.buffer, i);
      }
    }
    this.activeParticle = p;
    return p.continuation(p.store);
  };

  AsyncPF.prototype.sample = function(s, cc, a, erp, params) {
    return cc(s, erp.sample(params));
  };

  AsyncPF.prototype.factor = function(s, cc, a, score) {
    this.activeParticle.weight += score;
    this.activeParticle.continuation = cc;
    this.activeParticle.store = s;
    var fi = this.activeParticle.factorIndex;
    var newFI = fi == undefined ? 0 : fi + 1;
    this.activeParticle.factorIndex = newFI;
    this.branching(newFI);      // compute branching and #children
    return this.run();          // return to run
  };

  AsyncPF.prototype.branching = function(factorIndex) {
    // find weights at current observation
    var lk = this.obsWeights[factorIndex];

    if (lk == undefined) {     // 1st particle at observation
      var det = {
        wbar: this.activeParticle.weight,
        mnk: 1
      };
      this.obsWeights[factorIndex] = [det];
      this.activeParticle.numChildrenToSpawn = 1;
    } else {                    // 2nd or greater particle at observation
      var currMultiplicity = this.activeParticle.multiplicity;
      var currWeight = this.activeParticle.weight;
      var denom = lk.length + currMultiplicity; // k - 1 + Ckn
      var prevWBar = lk[lk.length - 1].wbar;
      var wbar = -Math.log(denom) + util.logsumexp([Math.log(lk.length) + prevWBar,
                                                    Math.log(currMultiplicity) + currWeight]);
      if (wbar > 0) throw 'Positive weight!!'; // sanity check
      var logRatio = currWeight - wbar;
      var numChildrenAndWeight = [];

      // compute number of children and their weights
      if (logRatio < 0) {
        numChildrenAndWeight = Math.log(Math.random()) < logRatio ?
            [1, wbar] :
            [0, -Infinity];
      } else {
        var totalChildren = 0;
        for (var v = 0; v < lk.length; v++) totalChildren += lk[v].mnk; // \sum M^k_n
        var minK = Math.min(this.numParticles, lk.length); // min(K_0, k-1)
        var rnk = Math.exp(logRatio);
        var clampedRnk = totalChildren <= minK ? Math.ceil(rnk) : Math.floor(rnk);
        numChildrenAndWeight = [clampedRnk, currWeight - Math.log(clampedRnk)];
      }
      var det2 = {
        wbar: wbar,
        mnk: numChildrenAndWeight[0]
      };
      this.obsWeights[factorIndex] = lk.concat([det2]);

      if (numChildrenAndWeight[0] > 0) {            // there are children
        if (this.buffer.length < this.bufferSize) { // buffer can be added to
          this.activeParticle.numChildrenToSpawn = numChildrenAndWeight[0];
          this.activeParticle.weight = numChildrenAndWeight[1];
        } else {                  // buffer full, update multiplicty
          this.activeParticle.multiplicity *= numChildrenAndWeight[0];
          this.activeParticle.numChildrenToSpawn = 1;
          this.activeParticle.weight = numChildrenAndWeight[1];
        }
        this.buffer.push(this.activeParticle); // push into buffer
      }
    }
  };

  AsyncPF.prototype.exit = function(s, retval) {
    this.activeParticle.value = retval;
    this.activeParticle.completed = true;

    // correct weight with multiplicity
    this.activeParticle.weight += Math.log(this.activeParticle.multiplicity);
    this.exitedParticles += 1;

    var k = JSON.stringify(retval);
    if (this.hist[k] === undefined) this.hist[k] = {prob: 0, val: retval};
    this.hist[k].prob += 1;

    if (this.exitedParticles < this.numParticles) {
      return this.run();
    } else {
      var dist = erp.makeMarginalERP(this.hist);

      var lastFactorIndex = this.activeParticle.factorIndex;
      var olk = this.obsWeights[lastFactorIndex];
      dist.normalizationConstant = Math.log(olk.length) - // K_n
          Math.log(this.numParticles) +                   // K_0
          olk[olk.length - 1].wbar;                       // Wbar^k_n

      // allow for continuing pf
      var currCoroutine = this;
      dist.continue = function(s, k, a, numP) {
        currCoroutine.k = k;
        currCoroutine.oldCoroutine = env.coroutine;
        env.coroutine = currCoroutine;
        currCoroutine.oldStore = _.clone(s); // will be reinstated at the end
        return currCoroutine.run(numP);
      };

      // Reinstate previous coroutine:
      env.coroutine = this.oldCoroutine;
      // Return from particle filter by calling original continuation:
      return this.k(this.oldStore, dist);
    }
  };

  function asyncPF(s, cc, a, wpplFn, numParticles, bufferSize) {
    return new AsyncPF(s, cc, a, wpplFn, numParticles, bufferSize).run(numParticles);
  }

  return {
    AsyncPF: asyncPF
  };

};
