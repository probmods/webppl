'use strict';

var util = require('../../util');
var paramStruct = require('../../params/struct');

// This estimator currently makes the following assumptions:

// 1. The model contains exactly one `mapData`.

// 2. Either a) each element of the data array is observed (passed to
// `observe` as its second argument) exactly once in the corresponding
// observation function, or b) each element of the data array is
// itself an array, of which each element is observed exactly once,
// and in the order in which they appear in the array. See below for
// examples of each of these.

// 3. There are no factor statements. We assume we can generate
// samples from the posterior predictive distribution directly by
// forward sampling. If there were additional factors we'd need to
// account for them with e.g. importance sampling.

// 4. observe is only used within mapData.

// Examples:

// var model = function() {
//   // global random choices
//   mapData({data: [x, y]}, function(datum) {
//     // latent random choices
//     observe(dist, datum);
//   });
// };

// var model = function() {
//   // global random choices
//   mapData({data: [[x1, y1], [x2, y2]]}, function(arr) {
//     // latent random choices
//     observe(dist, arr[0]);
//     observe(dist, arr[1]);
//   });
// };

module.exports = function(env) {

  var dreamSample = require('./sample')(env);
  var dreamGradients = require('./gradients')(env);

  return function(wpplFn, s, a, options, state, step, cont) {
    var opts = util.mergeDefaults(options, {
      samples: 1
    });

    var objVal = 0;
    var grad = {};

    return util.cpsLoop(
        opts.samples,
        // Loop body.
        function(i, next) {
          return dreamSample(wpplFn, s, a, function(record) {
            return dreamGradients(wpplFn, record, s, a, function(g, objVal_i) {
              paramStruct.addEq(grad, g);
              objVal += objVal_i;
              return next();
            });
          });
        },
        // Continuation.
        function() {
          paramStruct.divEq(grad, opts.samples);
          objVal /= opts.samples;
          return cont(grad, objVal);
        });
  };

};
