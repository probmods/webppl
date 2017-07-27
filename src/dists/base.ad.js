////////////////////////////////////////////////////////////////////
// Distributions
//
// Distributions can have sampling, scoring, and support functions. A
// single distribution need not have all three, but some inference
// functions will complain if they're missing one.
//
// The main thing we can do with distributions in WebPPL is feed them
// into the "sample" primitive to get a sample.
//
// required:
// - dist.sample() returns a value sampled from the distribution.
// - dist.score(val) returns the log-probability of val under the
//   distribution.
//
// Note that `sample` methods are responsible for un-lifting params as
// necessary.
//
// optional:
// - dist.support() gives either an array of support elements (for
//   discrete distributions with finite support) or an object with
//   'lower' and 'upper' properties (for continuous distributions with
//   bounded support).
//
// All distributions should also satisfy the following:
//
// - All distributions of a particular type should share the same set
//   of parameters.
//
// Optional parameters:
//
// The default Dist constructor checks that all parameters described
// in a distribution's definition are present. The `optional` flag can
// be set on a parameter to skip this check. In such cases a custom
// constructor must be defined to fill in the value of the parameter
// when omitted. More specifically, the constructor should extend the
// `params` object to include an appropriate default value. This
// ensures that the condition described above (regarding all types
// sharing the same set of parameters) is met. Care should also be
// taken not to modify the `params` object originally passed by the
// user.

'use strict';

var _ = require('lodash');
var ad = require('../ad');
var util = require('../util');
var inspect = require('util').inspect;

// This acts as a base class for all distributions.

function Distribution() {}

Distribution.prototype = {

  toJSON: function() {
    throw new Error('Not implemented');
  },

  inspect: function(depth, options) {
    if (_.has(this, 'params')) {
      if (this.print) {
        return this.print();
      } else {
        return [this.meta.name, '(', inspect(this.params), ')'].join('');
      }
    } else {
      // This isn't an instance of a distribution type.
      // e.g. Uniform.prototype.inspect()
      // Reinspect while ignoring this custom inspection method.
      var opts = options ? _.clone(options) : {};
      opts.customInspect = false;
      return inspect(this, opts);
    }
  },

  toString: function() {
    return this.inspect();
  },

  isContinuous: false,
  constructor: Distribution

};

function isDist(x) {
  return x instanceof Distribution;
}

function clone(dist) {
  return new dist.constructor(dist.params);
}

// Mixins.

// The motivation for using mixins is that there isn't an obviously
// correct (single inheritance) hierarchy. For example, the categories
// uni/multi-variate and discrete/continuous are cross-cutting.

var finiteSupport = {

  MAP: function() {
    var map = { score: -Infinity };
    this.support().forEach(function(val) {
      var score = this.score(val);
      if (score > map.score) {
        map = { val: val, score: score };
      }
    }, this);
    return map;
  },

  entropy: function() {
    'use ad';
    return _.reduce(this.support(), function(memo, x) {
      var score = this.score(x);
      return memo - (score === -Infinity ? 0 : Math.exp(score) * score);
    }.bind(this), 0);
  },

  toJSON: function() {
    var support = this.support();
    var probs = support.map(function(s) { return Math.exp(this.score(s)); }, this);
    return { probs: probs, support: support };
  }

};

var continuousSupport = {
  isContinuous: true
};

// Flag to indicate that HMC is not supported by a distribution.
var noHMC = {
  noHMC: true
};

var methodNames = ['sample', 'score', 'support', 'print', 'base', 'transform'];

function makeDistributionType(options) {
  options = util.mergeDefaults(options, {
    mixins: []
  });

  ['name', 'params'].forEach(function(name) {
    if (!_.has(options, name)) {
      console.log(options);
      throw new Error('makeDistributionType: ' + name + ' is required.');
    }
  });

  // Wrap the score function with args check.
  if (options.score) {
    var originalScoreFn = options.score;
    options.score = function(val) {
      if (arguments.length !== 1) {
        throw new Error('The score method of ' + this.meta.name +
                        ' expected 1 argument but received ' +
                        arguments.length + '.');
      }
      return originalScoreFn.call(this, val);
    };
  }

  var parameterNames = _.map(options.params, 'name');
  var parameterTypes = _.map(options.params, function(param) {
    if (_.has(param, 'type') && !(param.type && param.type.check)) {
      throw new Error('Invalid type given for parameter ' + param.name + ' of ' + options.name + '.');
    }
    return param.type;
  });
  var parameterOptionalFlags = _.map(options.params, 'optional');
  var extraConstructorFn = options.constructor;

  // Note that Chrome uses the name of this local variable in the
  // output of `console.log` when it's called on a distribution that
  // uses the default constructor.

  // The option to skip parameter checks is only used internally. It
  // makes it possible to avoid performing checks multiple times when
  // one distribution uses another distribution internally.

  var dist = function(params, skipParamChecks) {
    params = params || {};
    if (!skipParamChecks) {
      parameterNames.forEach(function(p, i) {
        if (params.hasOwnProperty(p)) {
          var type = parameterTypes[i];
          if (type && !type.check(ad.valueRec(params[p]))) {
            throw new Error('Parameter \"' + p + '\" should be of type "' + type.desc + '".');
          }
        } else {
          if (!parameterOptionalFlags[i]) {
            throw new Error('Parameter \"' + p + '\" missing from ' + this.meta.name + ' distribution.');
          }
        }
      }, this);
    }
    this.params = params;
    if (extraConstructorFn !== undefined) {
      extraConstructorFn.call(this);
    }
  };

  dist.prototype = Object.create(Distribution.prototype);
  dist.prototype.constructor = dist;

  dist.prototype.meta = _.pick(options, 'name', 'desc', 'params', 'nodoc', 'nohelper', 'wikipedia');

  _.assign.apply(_, [dist.prototype].concat(options.mixins));
  _.assign(dist.prototype, _.pick(options, methodNames));

  ['sample', 'score'].forEach(function(method) {
    if (!dist.prototype[method]) {
      throw new Error('makeDistributionType: method "' + method + '" not defined for ' + options.name);
    }
  });

  return dist;
}

module.exports = {
  makeDistributionType: makeDistributionType,
  finiteSupport: finiteSupport,
  continuousSupport: continuousSupport,
  noHMC: noHMC,
  isDist: isDist,
  clone: clone
};
