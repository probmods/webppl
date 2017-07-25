'use strict';

var _ = require('lodash');
var ad = require('../ad');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');
var laplace = require('./laplace');

var T = ad.tensor;

function sample(location, scale, dims) {
  var x = new Tensor(dims);
  var n = x.length;
  while (n--) {
    x.data[n] = laplace.sample(location, scale);
  }
  return x;
}

function score(location, scale, dims, x) {
  'use ad';
  var _x = ad.value(x);

  if (!util.isTensor(_x) || !_.isEqual(_x.dims, dims)) {
    return -Infinity;
  }

  var l = _x.length;
  var ln2b = l * Math.log(2 * scale);
  var xMuB = T.sumreduce(T.abs(T.sub(x, location))) / scale;
  return -1 * (ln2b + xMuB);
}

var TensorLaplace = base.makeDistributionType({
  name: 'TensorLaplace',
  desc: 'Distribution over a tensor of independent Laplace variables.',
  params: [
    {name: 'location', desc: '', type: types.unboundedReal},
    {name: 'scale', desc: '', type: types.positiveReal},
    {name: 'dims', desc: 'dimension of tensor', type: types.array(types.positiveInt)}
  ],
  mixins: [base.continuousSupport],
  sample: function() {
    var location = ad.value(this.params.location);
    var scale = ad.value(this.params.scale);
    var dims = this.params.dims;
    return sample(location, scale, dims);
  },
  score: function(x) {
    return score(this.params.location, this.params.scale, this.params.dims, x);
  },
  base: function() {
    var dims = this.params.dims;
    return new TensorLaplace({location: 0, scale: 1, dims: dims});
  },
  transform: function(x) {
    var location = this.params.location;
    var scale = this.params.scale;
    return ad.tensor.add(ad.tensor.mul(x, scale), location);
  }
});

module.exports = {
  TensorLaplace: TensorLaplace
};
