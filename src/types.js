'use strict';

// The core of each "type" is a predicate that indicates whether a
// particular value is in the type. This is primarily used to perform
// run time checks on arguments passed to distribution constructors.
// Some additional information is added to the types to help generate
// documentation and guide distributions.

var util = require('./util');
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
  if (!Number.isInteger(low) && low !== -Infinity) {
    throw new Error('Lower bound expected.');
  }
  return {
    name: 'int',
    desc: 'int (>=' + low + ')',
    check: function(val) {
      return Number.isInteger(val) && val >= low;
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

// Note that we currently performs element wise checks on Tensors.
// This is useful, even for unbounded tensors, because typed arrays
// can still hold invalid values such as NaN and ±Infinity.

var vector = function(interval) {
  errorIfNotInterval(interval);
  var checkBounds = checkInterval(interval);
  return {
    name: 'vector',
    desc: appendInterval('vector', interval),
    bounds: interval,
    check: function(val) {
      return util.isVector(val) && val.data.every(checkBounds);
    }
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
  var vectorType = vector(interval);
  var realArrayType = array(real(interval));
  return {
    name: 'vectorOrRealArray',
    desc: appendInterval('vector or real array', interval),
    check: function(val) {
      return vectorType.check(val) || realArrayType.check(val);
    }
  };
};

var symmetricPsdMatrix = {
  name: 'symmetricPsdMatrix',
  desc: 'symmetric positive semidefinite matrix',
  // TODO: Check symmetric, or at least square?
  check: function(val) {
    return util.isMatrix(val);
  }
};

var tensor = function(interval) {
  errorIfNotInterval(interval);
  var checkBounds = checkInterval(interval);
  return {
    name: 'tensor',
    desc: appendInterval('tensor', interval),
    bounds: interval,
    check: function(val) {
      return util.isTensor(val) && val.data.every(checkBounds);
    }
  };
};

// TODO: Implement. (Used by Multinomial.)
var probabilityArray = function() { return any; };

module.exports = {
  // Basic types.
  any: any,
  int: int,
  real: real,
  array: array,
  vector: vector,
  vectorOrRealArray: vectorOrRealArray,
  symmetricPsdMatrix: symmetricPsdMatrix,
  tensor: tensor,
  probabilityArray: probabilityArray,
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
  unitIntervalVector: vector(parseInterval('[0, 1]')),
  unboundedVectorOrRealArray: vectorOrRealArray(parseInterval('(-Infinity, Infinity)')),
  nonNegativeVectorOrRealArray: vectorOrRealArray(parseInterval('[0, Infinity)')),
  unboundedTensor: tensor(parseInterval('(-Infinity, Infinity)')),
  positiveTensor: tensor(parseInterval('(0, Infinity)'))
};
