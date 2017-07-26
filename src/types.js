'use strict';

// The core of each "type" is a predicate that indicates whether a
// particular value is in the type. This is primarily used to perform
// run time checks on arguments passed to distribution constructors.
// Some additional information is added to the types to help generate
// documentation and guide distributions.

var _ = require('lodash');
var util = require('./util');
var numeric = require('./math/numeric');
var interval = require('./math/interval');

var isInterval = interval.isInterval;
var parseInterval = interval.parse;
var checkInterval = interval.check;

function errorIfNotInterval(arg) {
  if (!isInterval(arg)) {
    throw new Error('Interval expected.');
  }
}

function appendInterval(name, interval) {
  return interval.isBounded ? name + ' ' + interval : name;
}

var any = {
  name: 'any',
  desc: 'any',
  check: function(val) {
    return true;
  }
};

var int = function(low) {
  if (!util.isInteger(low) && low !== -Infinity) {
    throw new Error('Lower bound expected.');
  }
  return {
    name: 'int',
    desc: 'int (>=' + low + ')',
    check: function(val) {
      return util.isInteger(val) && val >= low;
    }
  };
};

var real = function(interval) {
  errorIfNotInterval(interval);
  var checkBounds = checkInterval(interval);
  return {
    name: 'real',
    desc: appendInterval('real', interval),
    bounds: interval,
    check: function(val) {
      return typeof val === 'number' && checkBounds(val);
    }
  };
};

var array = function(elementType) {
  return {
    name: 'array',
    desc: elementType.desc + ' array',
    elementType: elementType,
    check: function(val) {
      return Array.isArray(val) && (elementType === any || val.every(elementType.check));
    }
  };
};

// The element wise checks are potentially useful, even for unbounded
// tensors, because typed arrays can still hold invalid values such as
// NaN and ±Infinity. In simple benchmarks this appears expensive, but
// when doing optimization based inference the cost might only be a
// small constant factor.

var vector = function(interval, performBoundsCheck) {
  errorIfNotInterval(interval);
  var checkBounds = checkInterval(interval);
  return {
    name: 'vector',
    desc: appendInterval('vector', interval),
    bounds: interval,
    check: performBoundsCheck ?
        function(val) { return util.isVector(val) && _.every(val.data, checkBounds); } :
        util.isVector
  };
};

// We could have a general way of combining types, but since we'd only
// use the combination "vector or real array" I think just adding a
// type for that will be a better approach. For example, it's fairly
// straight forward for guide code to look at this and determine it
// can be guided with a vector. Inspecting arbitrary combinations will
// be more complicated.
var vectorOrRealArray = function(interval) {
  errorIfNotInterval(interval);
  var vectorType = vector(interval, true);
  var realArrayType = array(real(interval));
  return {
    name: 'vectorOrRealArray',
    desc: appendInterval('vector or real array', interval),
    bounds: interval,
    check: function(val) {
      return vectorType.check(val) || realArrayType.check(val);
    }
  };
};

var posDefMatrix = {
  name: 'posDefMatrix',
  desc: 'positive definite matrix',
  check: function(val) {
    return util.isMatrix(val) && val.dims[0] === val.dims[1];
  }
};

var tensor = function(interval, performBoundsCheck) {
  errorIfNotInterval(interval);
  var checkBounds = checkInterval(interval);
  return {
    name: 'tensor',
    desc: appendInterval('tensor', interval),
    bounds: interval,
    check: performBoundsCheck ?
        function(val) { return util.isTensor(val) && _.every(val.data, checkBounds); } :
        util.isTensor
  };
};

var probabilityArray = function() {
  var tol = 1e-8;
  var baseType = array(real(parseInterval('[0, Infinity)')));
  return {
    name: 'probabilityArray',
    desc: 'real array with elements that sum to one',
    check: function(val) {
      return baseType.check(val) && Math.abs(1 - numeric._sum(val)) < tol;
    }
  };
};

module.exports = {
  // Basic types.
  any: any,
  int: int,
  real: real,
  array: array,
  vector: vector,
  vectorOrRealArray: vectorOrRealArray,
  posDefMatrix: posDefMatrix,
  tensor: tensor,
  probabilityArray: probabilityArray(),
  // Named instances for convenience.
  unboundedInt: int(-Infinity),
  nonNegativeInt: int(0),
  positiveInt: int(1),
  unboundedReal: real(parseInterval('(-Infinity, Infinity)')),
  extendedReal: real(parseInterval('[-Infinity, Infinity]')),
  positiveReal: real(parseInterval('(0, Infinity)')),
  unitInterval: real(parseInterval('[0, 1]')),
  unboundedVector: vector(parseInterval('(-Infinity, Infinity)')),
  nonNegativeVector: vector(parseInterval('[0, Infinity)')),
  positiveVector: vector(parseInterval('(0, Infinity)')),
  positiveVectorCB: vector(parseInterval('(0, Infinity)'), true),
  unitIntervalVector: vector(parseInterval('[0, 1]')),
  unboundedVectorOrRealArray: vectorOrRealArray(parseInterval('(-Infinity, Infinity)')),
  nonNegativeVectorOrRealArray: vectorOrRealArray(parseInterval('[0, Infinity)')),
  unboundedTensor: tensor(parseInterval('(-Infinity, Infinity)')),
  positiveTensor: tensor(parseInterval('(0, Infinity)'))
};
