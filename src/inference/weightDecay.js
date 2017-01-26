'use strict';

var assert = require('assert');
var _ = require('lodash');
var util = require('../util');
var paramStruct = require('../params/struct');

// Creates a function that modifies parameter gradients (in-place) to
// include the gradients of a weight decay penalty.

function parseOptions(opts, verbose) {
  if (_.isNumber(opts)) {
    // For convenience, accept a number in place of an options object.
    // e.g. `{weightDecay: 0.1}`
    return parseOptions({l2: {strength: opts}}, verbose);
  } else {
    // General case.
    // e.g. `{weightDecay: {l2: {strength: 0.1}}}`
    return util.getValAndOpts(opts, function(penalty, opts) {
      if (!_.has(penalties, penalty)) {
        throw new Error('Optimize: Unknown weight decay penalty ' + penalty +
                        '. Choose from ' + _.keys(penalties) + '.');
      }
      return penalties[penalty](opts, verbose);
    });
  }
}

// Each implementation of weight decay is expected to add a penalty
// term for the parameters encountered while estimating gradients
// only. The alternative of penalizing all parameters is not feasible,
// since parameters are created lazily by the program been optimized.
// Note that this strategy is equivalent to the weight decay produced
// by using Gaussian priors and Delta guides when optimizing the ELBO.

var penalties = {

  // L2 penalty: 0.5 * strength * param_i^2

  l2: function(opts, verbose) {
    opts = util.mergeDefaults(opts, {
      strength: 1
    });
    var strength = opts.strength;
    if (!_.isNumber(strength) || strength < 0) {
      throw new Error('Optimize: L2 strength should be a non-negative number.');
    }
    else if (strength === 0) {
      return _.noop;
    }
    else {
      if (verbose) {
        console.log('Optimize will apply L2 weight decay with strength=' + strength + '.');
      }
      return function(gradObj, paramsObj) {
        var gradPenalty = paramStruct.select(paramsObj, gradObj);
        assert.strictEqual(_.size(gradObj), _.size(gradPenalty),
                           'Expected grads to be the same size.');
        paramStruct.mulEq(gradPenalty, strength);
        paramStruct.addEq(gradObj, gradPenalty);
      };
    }
  }

};

module.exports = {
  parseOptions: parseOptions
};
