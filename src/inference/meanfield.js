var _ = require('underscore');
var util = require('../util');
var Tensor = require('../tensor');
var ad = require('../ad');
var guide = require('../guide');

module.exports = function(env) {

  function guideDist(targetDist, sampleAddress) {

    // Include the distribution name in the guide parameter name to
    // avoid collisions when the distribution type changes between
    // calls. (As a result of the distribution passed depending on a
    // random choice.)
    var relativeAddress = util.relativizeAddress(env, sampleAddress);
    var baseName = relativeAddress + '$mf$' + targetDist.meta.name + '$';

    var distSpec = guide.spec(targetDist);

    var guideParams = _.mapObject(distSpec.params, function(paramSpec, paramName) {

      var dims = paramSpec.dims; // e.g. [2, 1]
      var domain = paramSpec.domain; // e.g. new RealInterval(0, Infinity)

      var name = baseName + paramName;
      var param = registerParam(name, paramSpec.dims);

      // Apply squishing.
      if (domain) {
        // Assume that domain is a RealInterval.
        param = guide.squishFn(domain.a, domain.b)(param);
      }

      // Collapse tensor with dims=[1] to scalar.
      if (dims.length === 1 && dims[0] === 1) {
        param = ad.tensorEntry(param, 0);
      }

      return param;

    });

    return new distSpec.type(guideParams);

  }

  function registerParam(name, dims) {
    return util.registerParams(env, name, function() {
      console.log('Initializing mean-field parameter: ' + name);
      // TODO: Set the initial value of the parameters to the value of
      // the parameters of the target distribution? This would be
      // fiddly in the presence of squishing.
      return [new Tensor(dims)];
    })[0];
  }

  return {
    guideDist: guideDist
  };

};
