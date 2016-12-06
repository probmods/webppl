'use strict';

var types = require('../src/types');
var Tensor = require('../src/tensor');
var parseInterval = require('../src/math/interval').parse;

function testMembership(type, obj) {
  return function(test) {
    obj.inside.forEach(function(val) {
      test.ok(type.check(val), JSON.stringify(val) + ' was expected to check for type ' + type.desc);
    });
    obj.outside.forEach(function(val) {
      test.ok(!type.check(val), JSON.stringify(val) + ' was not expected to check for type ' + type.desc);
    });
    test.done();
  };
}

function vec(arr) {
  return new Tensor([arr.length, 1]).fromFlatArray(arr);
}

function mat(arr) {
  return new Tensor([arr.length, arr[0].length]).fromArray(arr);
}

function zeros(dims) {
  return new Tensor(dims);
}

var nonNumVals = ['a', true, NaN];
var infVals = [-Infinity, Infinity];

module.exports = {

  any: testMembership(types.any, {
    inside: nonNumVals.concat(infVals),
    outside: []
  }),

  unboundedInt: testMembership(types.unboundedInt, {
    inside: [-1e6, -1, 0, 1, 1e6],
    outside: [.1].concat(nonNumVals).concat(infVals)
  }),

  nonNegativeInt: testMembership(types.nonNegativeInt, {
    inside: [0, 1, 1e6],
    outside: [-1e6, -1, .1].concat(nonNumVals).concat(infVals)
  }),

  positiveInt: testMembership(types.positiveInt, {
    inside: [1, 1e6],
    outside: [-1e6, -1, 0, .1].concat(nonNumVals).concat(infVals)
  }),

  unboundedReal: testMembership(types.unboundedReal, {
    inside: [-1e6, -.1, 0, .1, 1e6],
    outside: nonNumVals.concat(infVals)
  }),

  extendedReal: testMembership(types.extendedReal, {
    inside: [-1e6, -.1, 0, .1, 1e6].concat(infVals),
    outside: nonNumVals
  }),

  positiveReal: testMembership(types.positiveReal, {
    inside: [.1, 1e6],
    outside: [-1, 0].concat(nonNumVals).concat(infVals)
  }),

  unitInterval: testMembership(types.unitInterval, {
    inside: [0, .1, 1],
    outside: [-1, 2].concat(nonNumVals).concat(infVals)
  }),

  anyArray: testMembership(types.array(types.any), {
    inside: [[], [0], [.1], ['a'], [true]],
    outside: [0, 'a', true]
  }),

  intArray: testMembership(types.array(types.unboundedInt), {
    inside: [[], [0]],
    outside: [[.1], ['a'], [true], 0, 'a', true]
  }),

  vector: testMembership(types.vector(parseInterval('(-Infinity, Infinity)'), true), {
    inside: [vec([]), vec([-1e6]), vec([0]), vec([1e6])],
    outside: [0, 'a', true, vec([NaN]), vec([-Infinity]), vec([Infinity])]
  }),

  positiveVector: testMembership(types.vector(parseInterval('(0, Infinity)'), true), {
    inside: [vec([]), vec([1e6])],
    outside: [0, 'a', true, vec([-1e6]), vec([0]), vec([NaN]), vec([-Infinity]), vec([Infinity])]
  }),

  vectorOrRealArray: testMembership(types.unboundedVectorOrRealArray, {
    inside: [
      vec([]), vec([-1e6]), vec([0]), vec([1e6]),
      [], [-1e6], [0], [1e6]
    ],
    outside: [
      0, 'a', true,
      ['a'], [true],
      [NaN], [-Infinity], [Infinity],
      vec([NaN]), vec([-Infinity]), vec([Infinity])
    ]
  }),

  posDefMatrix: testMembership(types.posDefMatrix, {
    inside: [zeros([1, 1]), zeros([2, 2])],
    outside: [zeros([1, 1, 1]), zeros([2, 1]), [], 0, 'a', true]
  }),

  unboundedTensor: testMembership(types.tensor(parseInterval('(-Infinity, Infinity)'), true), {
    inside: [vec([]), mat([[]]), vec([0]), vec([1]), mat([[0]]), mat([[1]]), zeros([1, 1, 1])],
    outside: [[], 0, 'a', true]
  }),

  positiveTensor: testMembership(types.tensor(parseInterval('(0, Infinity)'), true), {
    inside: [vec([]), mat([[]]), vec([1]), mat([[1]])],
    outside: [vec([0]), mat([[0]]), zeros([1, 1, 1]), [], 0, 'a', true]
  }),

  probabilityArray: testMembership(types.probabilityArray, {
    inside: [[1], [.4, .6], [1 - 9e-9]],
    outside: [[], [.999], [.5, .499]].concat(nonNumVals).concat(infVals)
  })

};
