"use strict";

var _ = require('underscore');

function runningInBrowser(){
  return !(typeof window === 'undefined');
}

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

var normalizeHist = function(hist){
  var normHist = {};
  var Z = sum(_.values(hist));
  _.each(hist, function(val, key){normHist[key] = hist[key]/Z;});
  return normHist;
};

var normalizeArray = function(xs){
  var Z = sum(xs);
  return xs.map(function(x){return x/Z;});
};

var logsumexp = function(a) {
  var m = Math.max.apply(null, a);
  var sum = 0;
  for (var i=0; i<a.length; ++i) {
    sum += (a[i] === -Infinity ? 0 : Math.exp(a[i] - m));
  }
  return m + Math.log(sum);
};

var copyObj = function(obj){
  var newobj = {};
  for(var k in obj){
    if(obj.hasOwnProperty(k)){newobj[k] = obj[k];}
  }
  return newobj;
}

// func(x, i, xs, nextK)
// nextK()
function cpsForEach(func, nextK, xs, i){
  i = (i === undefined) ? 0 : i;
  if (i === xs.length-1){
    nextK();
  } else {
    func(xs[i], i, xs, function(){
      cpsForEach(func, nextK, xs, i+1);
    });
  }
}

module.exports = {
  copyObj: copyObj,
  cpsForEach: cpsForEach,
  gensym: gensym,
  logsumexp: logsumexp,
  makeGensym: makeGensym,
  normalizeArray: normalizeArray,
  normalizeHist: normalizeHist,
  prettyJSON: prettyJSON,
  runningInBrowser: runningInBrowser,
  sum: sum
};
