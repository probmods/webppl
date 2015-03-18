"use strict";

var _ = require('underscore');

function runningInBrowser(){
  return (typeof window !== 'undefined');
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

function sum(xs){
  if (xs.length === 0) {
    return 0.0;
  } else {
    var total = _(xs).reduce(
      function(a, b) {
        return a + b;
      });
    return total;
  }
}

function normalizeHist(hist){
  var normHist = {};
  var Z = sum(_.values(hist));
  _.each(hist, function(val, key){normHist[key] = hist[key]/Z;});
  return normHist;
}

function normalizeArray(xs){
  var Z = sum(xs);
  return xs.map(function(x){return x/Z;});
}

function logsumexp(a) {
  var m = Math.max.apply(null, a);
  var sum = 0;
  for (var i=0; i<a.length; ++i) {
    sum += (a[i] === -Infinity ? 0 : Math.exp(a[i] - m));
  }
  return m + Math.log(sum);
}

function copyObj(obj){
  var newobj = {};
  for(var k in obj){
    if(obj.hasOwnProperty(k)){newobj[k] = obj[k];}
  }
  return newobj;
}

// more efficient version of (indexOf o map p)
var indexOfPred = function(l,p,start) {
  var start = start || 0;
  for(var i=start; i<l.length; i++){
    if (p(l[i])) return i;
  }
  return -1
}

// more efficient version of (indexOf o map p o reverse)
var lastIndexOfPred = function(l,p,start) {
  var start = start || l.length-1;
  for(var i=start; i>=0; i--){
    if (p(l[i])) return i;
  }
  return -1
}

// func(x, i, xs, nextK)
// nextK()
function cpsForEach(func, nextK, xs, i){
  i = (i === undefined) ? 0 : i;
  if (i === xs.length){
    nextK();
  } else {
    func(xs[i], i, xs, function(){
      cpsForEach(func, nextK, xs, i+1);
    });
  }
}

function histsApproximatelyEqual(hist, expectedHist, tolerance){
  var allOk = true;
  _.each(
    expectedHist,
    function(expectedValue, key){
      var value = hist[key] || 0;
      var testPassed = Math.abs(value - expectedValue) <= tolerance;
      allOk = allOk && testPassed;
    });
  if (!allOk){
    console.log("Expected:", expectedHist);
    console.log("Actual:", hist);
  }
  return allOk;
}

var deepcopy = (function() {

  // Cache of already-copied objects in case of cycles
  // (we give each object a unique ID for fast lookup)
  var nextid, visited, cache;

  function deepcopy(val)
  {
    nextid = 0;
    visited = [];
    cache = {};
    var cpval = recursive_deepcopy(val);
    // Remove cache id from all sub-objects
    var n = visited.length;
    while(n--) delete visited[n].__deepcopy_id__;
    return cpval;
  }

  function is(val, type)
  {
    return val.constructor === type;
  }

  function recursive_deepcopy(val)
  {
    // Atomics
    if (val === null || is(val, Number) || is(val, Boolean) ||
      is(val, String) || is(val, Function))
      return val;
    // Objects (check cache first)
    var cachedcopy = cache[val.__deepcopy_id__];
    if (!cachedcopy)
    {
      visited.push(val);
      cachedcopy = deepcopy_object(val);
      val.__deepcopy_id__ = nextid;
      cache[nextid] = cachedcopy;
      nextid++;
    }
    return cachedcopy;
  }

  function deepcopy_object(obj)
  {
    // Special objects
    // TODO: Any more of these we want to support?
    if (is(obj, Date) ||
      is(obj, RegExp) ||
      is(obj, Int8Array) ||
      is(obj, Uint8Array) ||
      is(obj, Uint8ClampedArray) ||
      is(obj, Int16Array) ||
      is(obj, Int32Array) ||
      is(obj, Uint32Array) ||
      is(obj, Float32Array) ||
      is(obj, Float64Array))
    {
      return new obj.constructor(obj);
    }
    // Arrays
    if (is(obj, Array))
    {
      var cparr = [];
      for (var i = 0; i < obj.length; i++)
        cparr.push(recursive_deepcopy(obj[i]));
      return cparr;
    }
    // Generic objects
    var cpobj = Object.create(obj.__proto__);
    for (var prop in obj)
    {
      if (obj.hasOwnProperty(prop))
      {
        cpobj[prop] = recursive_deepcopy(obj[prop]);
      }
    }
    return cpobj;
  }

  return deepcopy;

})();

module.exports = {
  copyObj: copyObj,
  cpsForEach: cpsForEach,
  gensym: gensym,
  logsumexp: logsumexp,
  indexOfPred: indexOfPred,
  lastIndexOfPred: lastIndexOfPred,
  makeGensym: makeGensym,
  normalizeArray: normalizeArray,
  normalizeHist: normalizeHist,
  prettyJSON: prettyJSON,
  runningInBrowser: runningInBrowser,
  sum: sum,
  histsApproximatelyEqual: histsApproximatelyEqual,
  deepcopy: deepcopy
};
