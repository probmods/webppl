'use strict';

var _ = require('underscore');
var assert = require('assert');
var erp = require('../erp.js');


module.exports = function(env) {

  var Rejection = require('./rejection')(env).Rejection;
  var MHKernel = require('./mhkernel')(env).MHKernel;

  // TODO: Could this be written in webppl?

  function MCMC(s, k, a, wpplFn, numIterations) {
    // Coroutine used to initialize trace. (Partially applied to make later
    // code a little easier to read.)
    var initialize = _.partial(Rejection, s, _, a, wpplFn);
    // The standard MH transition kernel.
    var transition = _.partial(MHKernel, s, _, a, wpplFn);

    return initialize(function(s, initialTrace) {
      var trace = initialTrace;
      var hist = {};

      console.log('Initialized');

      return util.cpsLoop(numIterations,
          function(i, next) {
            console.log('Iteration: ' + i);
            return transition(function(s, newTrace) {
              trace = newTrace;

              // Update histogram.
              var r = JSON.stringify(trace.val);
              if (hist[r] === undefined) hist[r] = { prob: 0, val: trace.val };
              hist[r].prob += 1;

              return next();
            }, trace);
          },
          function() { return k(s, erp.makeMarginalERP(hist)) }
      );
    });
  };

  return { MCMC: MCMC };

};
