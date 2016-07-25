'use strict';

var util = require('../util');

module.exports = function(env) {

  var driftKernelCoroutine = {
    sample: notAllowed('sample'),
    factor: notAllowed('factor'),
    incrementalize: env.defaultCoroutine.incrementalize
  };

  // A cps function to get the MH proposal distribution based on the
  // args passed to a sample statement and the value selected for this
  // random choice on the previous execution.

  // When present, we call the drift kernel function given as part of
  // options passed to sample. This function is evaluated with a
  // special coroutine installed to prevent calls to sample and
  // factor. (Allowing these would affect the correctness of marginal
  // inference.)

  // The prior is returned when no drift kernel function is given.

  function getProposalDist(s, a, dist, options, prevVal, k) {
    if (options && options.driftKernel) {
      var coroutine = env.coroutine;
      env.coroutine = driftKernelCoroutine;

      return options.driftKernel(s, function(s, val) {
        // Restore the previous coroutine.
        env.coroutine = coroutine;
        return k(s, val);
      }, a, prevVal);
    } else {
      // Use the prior as the proposal distribution.
      return k(s, dist);
    }
  }

  function notAllowed(fn) {
    return function() {
      throw new Error(fn + ' not allowed inside drift kernels.');
    };
  }

  // We show a warning when the score of a drift proposal is -Infinity
  // as it's likely this is caused by a bug in the drift kernel
  // function.
  function proposalWarning(priorDist) {
    util.warn(
        'Proposal from drift kernel has zero probability under ' +
        priorDist.meta.name +
        ' prior.');
  }

  return {
    getProposalDist: getProposalDist,
    proposalWarning: proposalWarning
  };

};
