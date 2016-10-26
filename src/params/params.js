'use strict';

var _ = require('underscore');
var ad = require('../ad');

var registerParams = function(env, name, getParams, setParams) {

  // getParams is expected to be a function which is used to
  // initialize parameters the first time they are encoutered. At
  // present I consider it to be `registerParams` responsibility to
  // perform lifting of params, so ideally `getParams` would not
  // return lifted params. However, in the case of NN, `getParams`
  // returns params already lifted. Hence, `getParams()` is replaced
  // with `getParams().map(ad.value)` throughout this function.

  var paramTable = env.coroutine.params;
  var paramsSeen = env.coroutine.paramsSeen;

  if (paramTable === undefined) {

    // Some coroutines ignore the guide when sampling (e.g. MH as
    // rejuv kernel) but still have to execute it while executing
    // the target. To ensure the guide doesn't error out, we return
    // something sensible from registerParams in such cases.

    return getParams().map(ad.value);

  } else if (paramsSeen && _.has(paramsSeen, name)) {

    // We've already lifted these params during this execution.
    // Re-use ad graph nodes.

    return paramsSeen[name];

  } else {

    // This is the first time we've encounter these params during
    // this execution. we will lift params at this point.

    var params;

    if (_.has(paramTable, name)) {
      // Seen on previous execution. Fetch from store and lift.
      params = paramTable[name].map(ad.lift);
    } else {
      // Never seen. Fetch initial values, add to store and lift.
      var _params = getParams().map(ad.value);
      paramTable[name] = _params;
      params = _params.map(ad.lift);
    }

    if (paramsSeen) {
      paramsSeen[name] = params;
    }

    // Callback with the fresh ad graph nodes.
    if (setParams) {
      setParams(params);
    }

    return params;
  }

};

module.exports = {
  registerParams: registerParams
};
