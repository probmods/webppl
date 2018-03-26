'use strict';

var assert = require('assert');
var _ = require('lodash');
var util = require('../util');

module.exports = function(env) {

  var makeMHKernel = require('./mhkernel')(env);
  var makeHMCKernel = require('./hmckernel')(env);

  function makeHMCwithMHKernel(options) {
    var hmc = makeHMCKernel(options);
    var mh = makeMHKernel({discreteOnly: true, adRequired: true});
    var kernel = function(cont, oldTrace, runOpts) {
      return hmc(function(trace) {
        return mh(cont, trace, runOpts);
      }, oldTrace, runOpts);
    };
    kernel.adRequired = true;
    return kernel;
  }

  var kernels = {
    MH: makeMHKernel,
    HMC: makeHMCwithMHKernel,
    HMConly: makeHMCKernel
  };

  // Takes a kernel options object (as passed to inference algorithms)
  // and returns the specified kernel with any options applied.

  function parseOptions(obj) {
    // Expects either a kernel name or an object containing a single
    // key/value pair where the key is a kernel name and the value is
    // an options object. e.g. 'MH' or { MH: { ... } }
    return util.getValAndOpts(obj, function(name, options) {
      if (!_.has(kernels, name)) {
        throw new Error(name + ' is not a valid kernel. ' +
                        'The following kernels are available: ' +
                        _.keys(kernels).join(', ') + '.');
      }
      return kernels[name](options);
    });
  }

  // Combinators for kernel functions.

  function tap(fn) {
    return function(k, trace) {
      fn(trace);
      return k(trace);
    };
  }

  function sequence() {
    var kernels = arguments;
    assert(kernels.length > 1);
    if (kernels.length === 2) {
      return function(k, trace1) {
        return kernels[0](function(trace2) {
          return kernels[1](k, trace2);
        }, trace1);
      };
    } else {
      return sequence(
          kernels[0],
          sequence.apply(null, _.rest(kernels)));
    }
  }

  function repeat(n, kernel) {
    return function(k, trace) {
      return util.cpsIterate(n, trace, kernel, k);
    };
  }

  return {
    parseOptions: parseOptions,
    tap: tap,
    sequence: sequence,
    repeat: repeat
  };

};
