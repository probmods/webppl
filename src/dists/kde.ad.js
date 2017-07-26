'use strict';

var _ = require('lodash');
var base = require('./base');
var types = require('../types');
var util = require('../util');
var Tensor = require('../tensor');
var stats = require('../math/statistics');
var numeric = require('../math/numeric');
var gaussian = require('./gaussian');
var diagCovGaussian = require('./diagCovGaussian');

// The implementation of defaultWidth for both Gaussian kernels uses
// Silverman's rule of thumb:
// https://en.wikipedia.org/wiki/Multivariate_kernel_density_estimation#Rule_of_thumb

var kernels = {
  gaussian: {
    dataType: types.unboundedReal,
    widthType: types.positiveReal,
    sample: gaussian.sample,
    score: gaussian.score,
    defaultWidth: function(data) {
      var sd = stats.sd(data);
      var n = data.length;
      var width = 1.06 * sd * Math.pow(n, -0.2);
      return width;
    }
  },
  mvGaussian: {
    dataType: types.unboundedVector,
    widthType: types.positiveVectorCB,
    sample: diagCovGaussian.sample,
    score: diagCovGaussian.score,
    defaultWidth: function(data) {
      var d = data[0].dims[0];
      var n = data.length;
      var mean = data.reduce(function(acc, x) {
        return acc.add(x);
      }).div(n);
      var sd = data.reduce(function(acc, x) {
        return acc.add(x.sub(mean).pow(2));
      }, new Tensor(data[0].dims)).div(n).sqrt();
      return sd.mul(Math.pow(4 / (d + 2), 1 / (d + 4)) * Math.pow(n, -1 / (d + 4)));
    }
  }
};

var KDE = base.makeDistributionType({
  name: 'KDE',
  desc: 'A distribution based on a kernel density estimate of ``data``. ' +
    'A Gaussian kernel is used, and both real and vector valued data are supported. ' +
    'When the data are vector valued, ``width`` should be a vector specifying the kernel ' +
    'width for each dimension of the data. ' +
    'When ``width`` is omitted, Silverman\'s rule of thumb ' +
    'is used to select a kernel width. This rule assumes the data are ' +
    'approximately Gaussian distributed. When this assumption does not hold, a ``width`` ' +
    'should be specified in order to obtain sensible results.',
  params: [
    {name: 'data', desc: 'data array'},
    {name: 'width', desc: 'kernel width', optional: true}
  ],
  wikipedia: 'Kernel_density_estimation',
  nohelper: true,
  mixins: [base.continuousSupport],
  constructor: function() {
    // Check data parameter.
    if (!_.isArray(this.params.data) ||
        _.isEmpty(this.params.data)) {
      throw new Error('Parameter "data" should be a non-empty array.');
    }

    // We assume an homogeneous array, and perform type checks on the
    // first element of the array only.
    var data = this.params.data;
    this.kernel = _.find(kernels, function(kernel) {
      return kernel.dataType.check(data[0]);
    });
    if (!this.kernel) {
      throw new Error('Parameter "data" should be an array of reals or vectors.');
    }

    // Compute default width if omitted.
    if (this.params.width === undefined) {
      this.params.width = this.kernel.defaultWidth(this.params.data);
    }

    // Check width parameter.
    if (!this.kernel.widthType.check(this.params.width)) {
      throw new Error('Parameter "width" should be of type ' + this.kernel.widthType.desc);
    }
  },
  sample: function() {
    var data = this.params.data;
    var width = this.params.width;
    var x = data[Math.floor(util.random() * data.length)];
    return this.kernel.sample(x, width);
  },
  score: function(val) {
    var data = this.params.data;
    var width = this.params.width;
    var n = data.length;
    var kernel = this.kernel;
    return data.reduce(
      function(acc, x) {
        return numeric.logaddexp(acc, kernel.score(x, width, val));
      },
      -Infinity) - Math.log(n);
  }
});

module.exports = {
  KDE: KDE
};
