"use strict";

var _ = require('underscore');

function makeGensym() {
  var seq = 0;
  return function(prefix){
    var result = prefix + seq;
    seq += 1;
    return result;
  };
}

var gensym = makeGensym();

function prettyJSON(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

var sum = function(xs){
  if (xs.length == 0) {
    return 0.0;
  } else {
    var total = _(xs).reduce(
      function(a, b) {
        return a + b;
      });
    return total;
  }
};

var normalize = function(hist){
  var normHist = {};
  var Z = sum(_.values(hist));
  _.each(hist, function(val, key){normHist[key] = hist[key]/Z;});
  return normHist;
};

module.exports = {
  gensym: gensym,
  prettyJSON: prettyJSON,
  sum: sum,
  normalize: normalize
}
