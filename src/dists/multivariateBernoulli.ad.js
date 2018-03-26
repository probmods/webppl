'use strict';

var _ = require('lodash');
var assert = require('assert');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');

function mvBernoulliScore(ps, x) {
  var _x = ad.value(x);
  var _ps = ad.value(ps);
  if (!util.isVector(_x) || !util.tensorEqDim0(_x, _ps)) {
    return -Infinity;
  }

  var xSub1 = ad.tensor.sub(x, 1);
  var pSub1 = ad.tensor.sub(ps, 1);

  return ad.tensor.sumreduce(
      ad.tensor.log(
      ad.tensor.add(
      ad.tensor.mul(x, ps),
      ad.tensor.mul(xSub1, pSub1))));
}

var MultivariateBernoulli = base.makeDistributionType({
  name: 'MultivariateBernoulli',
  desc: 'Distribution over a vector of independent Bernoulli variables. Each element ' +
      'of the vector takes on a value in ``{0, 1}``. Note that this differs from ``Bernoulli`` which ' +
      'has support ``{true, false}``.',
  params: [{name: 'ps', desc: 'probabilities', type: types.unitIntervalVector}],
  mixins: [base.finiteSupport],
  sample: function() {
    var ps = ad.value(this.params.ps);
    var d = ps.dims[0];
    var x = new Tensor([d, 1]);
    var n = x.length;
    while (n--) {
      x.data[n] = util.random() < ps.data[n];
    }
    return x;
  },
  score: function(x) {
    return mvBernoulliScore(this.params.ps, x);
  },
  support: function() {
    var dims = this.params.ps.dims;
    var d = dims[0];
    var n = Math.pow(2, d);
    return _.times(n, function(x) {
      return new Tensor(dims).fromFlatArray(toBinaryArray(x, d));
    });
  }
});

function toBinaryArray(x, length) {
  assert.ok(x >= 0 && x < Math.pow(2, length));
  var arr = [];
  for (var i = 0; i < length; i++) {
    arr.push(x % 2);
    x = x >> 1;
  }
  return arr;
}

module.exports = {
  MultivariateBernoulli: MultivariateBernoulli
};
