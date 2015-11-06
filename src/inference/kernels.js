'use strict';

var assert = require('assert');
var _ = require('underscore');
var util = require('../util');

module.exports = function(env) {

  var MH = require('./mhkernel')(env);

  function sequence(cont, runWppl, oldTrace, options) {
    var kernels = options.kernels;
    var iter = function(cont, trace, kernels) {
      if (kernels.length === 1) {
        return kernels[0](cont, runWppl, trace, options);
      } else {
        return kernels[0](function(trace2) {
          return iter(cont, trace2, _.rest(kernels));
        }, runWppl, trace, options);
      }

    };
    return iter(cont, oldTrace, kernels);
  }

  var kernels = { MH: MH, sequence: sequence };

  function parseOptions(obj) {

    function isKernelOption(obj) {
      // e.g. 'MH' or { MH: options }.
      return _.isString(obj) && _.has(kernels, obj) ||
          _.size(obj) === 1 && _.has(kernels, _.keys(obj)[0]);
    }

    function getKernelName(obj) {
      return _.isString(obj) ? obj : _.keys(obj)[0];
    }

    function getKernelOptions(obj) {
      return _.isString(obj) ? {} : _.values(obj)[0];
    }

    if (isKernelOption(obj)) {
      var name = getKernelName(obj);
      var options = parseOptions(getKernelOptions(obj));
      return function(cont, runWppl, oldTrace, extraOptions) {
        var allOptions = _.extendOwn({}, options, extraOptions);
        return kernels[name](cont, runWppl, oldTrace, allOptions);
      };
    } else if (_.isArray(obj)) {
      return _.map(obj, parseOptions);
    } else if (_.isObject(obj)) {
      return _.mapObject(obj, parseOptions);
    } else {
      return obj;
    }
  }

  // Combinators for kernel functions which have had runWppl and
  // options partially applied.

  function tap(fn) {
    return function(k, trace) {
      fn(trace);
      return k(trace);
    };
  }

  function seq() {
    var kernels = arguments;
    assert(kernels.length > 1);
    if (kernels.length === 2) {
      return function(k, trace1) {
        return kernels[0](function(trace2) {
          return kernels[1](k, trace2);
        }, trace1);
      };
    } else {
      return seq(
          kernels[0],
          seq.apply(null, _.rest(kernels)));
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
    sequence: seq,
    repeat: repeat,
    MH: MH
  };

};
