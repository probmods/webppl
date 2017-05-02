'use strict';

var util = require('../../util');
var paramStruct = require('../../params/struct');

// This estimator currently makes the following assumptions:

// 1. The model includes no more than one `mapData`.

// 2. Every evaluation of the observation function (associated with a
// `mapData`) includes one or more calls to `observe`, and either:

// 2a. There is exactly one call to `observe`, and the value yielded
// to the observation function is the value passed to `observe`. For
// example:

// var model = function() {
//   mapData({data}, function(datum) {
//     observe(dist, datum);
//   });
// };

// 2b. There is more than one call to `observe`, the value yielded to
// the observation function is an array, and successive observations
// are passed successive elements of the array, starting from the
// first element. For example:

// var model = function() {
//   mapData({data}, function(arr) {
//     observe(dist, arr[0]);
//     observe(dist, arr[1]);
//     observe(dist, arr[2]);
//   });
// };

// 3. There are no factor statements. We assume we can generate
// samples from the posterior predictive distribution directly by
// forward sampling. If there were additional factors we'd need to
// account for them with e.g. importance sampling.

// 4. observe is only used within mapData.

module.exports = function(env) {

  var dreamSample = require('./sample')(env).dreamSample;
  var dreamGradients = require('./gradients')(env);

  return function(options) {
    var opts = util.mergeDefaults(options, {
      samples: 1
    });
    return function(wpplFn, s, a, state, step, cont) {

      var objVal = 0;
      var grad = {};

      return util.cpsLoop(
        opts.samples,
        // Loop body.
        function(i, next) {
          return dreamSample(s, function(s, record) {
            return dreamGradients(wpplFn, record, s, a, function(g, objVal_i) {
              paramStruct.addEq(grad, g);
              objVal += objVal_i;
              return next();
            });
          }, a, wpplFn);
        },
        // Continuation.
        function() {
          paramStruct.divEq(grad, opts.samples);
          objVal /= opts.samples;
          return cont(grad, objVal);
        });
    };
  };
};
