'use strict';

var _ = require('underscore');
var assert = require('assert');
var process = require('process');
var seedrandom = require('seedrandom');

var rng = Math.random;

function random() {
  return rng();
}

function seedRNG(seed) {
  rng = seedrandom(seed);
}

function resetRNG() {
  rng = Math.random;
}

function getRandomSeedFromEnv() {
  if (process.env.RANDOM_SEED) {
    var seed = parseInt(process.env.RANDOM_SEED);
    assert(_.isFinite(seed), 'Random seed should be an integer.');
    return seed;
  }
}

function runningInBrowser() {
  return (typeof window !== 'undefined');
}

function makeGensym() {
  var seq = 0;
  return function(prefix) {
    var result = prefix + seq;
    seq += 1;
    return result;
  };
}

var gensym = makeGensym();

function prettyJSON(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function asArray(arg) {
  return arg ? [].concat(arg) : [];
}

function sum(xs) {
  if (xs.length === 0) {
    return 0.0;
  } else {
    var total = _.reduce(xs,
        function(a, b) {
          return a + b;
        });
    return total;
  }
}

function normalizeHist(hist) {
  var normHist = {};
  var Z = sum(_.values(hist));
  _.each(hist, function(val, key) {
    normHist[key] = hist[key] / Z;
  });
  return normHist;
}

var logHist = function(hist) {
  return _.mapObject(hist, function(x) {
    return {prob: Math.log(x.prob), val: x.val}
  });
};


function normalizeArray(xs) {
  var Z = sum(xs);
  return xs.map(function(x) {
    return x / Z;
  });
}

function logsumexp(a) {
  var m = Math.max.apply(null, a);
  var sum = 0;
  for (var i = 0; i < a.length; ++i) {
    sum += (a[i] === -Infinity ? 0 : Math.exp(a[i] - m));
  }
  return m + Math.log(sum);
}

function copyObj(obj) {
  var newobj = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {newobj[k] = obj[k];}
  }
  return newobj;
}

// More efficient version of (indexOf o map p)
var indexOfPred = function(l, p, start) {
  var start = start || 0;
  for (var i = start; i < l.length; i++) {
    if (p(l[i])) {
      return i;
    }
  }
  return -1;
};

// more efficient version of (indexOf o map p o reverse)
var lastIndexOfPred = function(l, p, start) {
  var start = start || l.length - 1;
  for (var i = start; i >= 0; i--) {
    if (p(l[i])) return i;
  }
  return -1;
};

var deleteIndex = function(arr, i) {
  return arr.slice(0, i).concat(arr.slice(i + 1))
}

// func(x, i, xs, cont)
// cont()
function cpsForEach(func, cont, xs, i) {
  i = (i === undefined) ? 0 : i;
  if (i === xs.length) {
    return cont();
  } else {
    return func(xs[i], i, xs, function() {
      return function() { // insert trampoline step
        return cpsForEach(func, cont, xs, i + 1);
      };
    });
  }
}

function cpsLoop(n, func, cont, i) {
  assert(_.isNumber(n), 'Number expected.');
  i = (i === undefined) ? 0 : i;
  if (i === n) {
    return cont();
  } else {
    return func(i, function() {
      return function() { // insert trampoline step
        return cpsLoop(n, func, cont, i + 1);
      };
    });
  }
}

function cpsIterate(n, initial, func, cont) {
  var val = initial;
  return cpsLoop(n,
      function(i, next) {
        return func(function(nextVal) {
          val = nextVal;
          return next();
        }, val);
      },
      function() { return cont(val); });
}

function histsApproximatelyEqual(hist, expectedHist, tolerance) {
  var allOk = (expectedHist !== undefined);
  _.each(
      expectedHist,
      function(expectedValue, key) {
        var value = hist[key] || 0;
        var testPassed = Math.abs(value - expectedValue) <= tolerance;
        allOk = allOk && testPassed;
      });
  if (!allOk) {
    console.log('Expected:', expectedHist);
    console.log('Actual:', hist);
  }
  return allOk;
}

function expectation(hist, func) {
  var f = func == undefined ? function(x) {return x;} : func;
  if (_.isArray(hist)) {
    return sum(hist) / hist.length;
  } else {
    var expectedValue = sum(_.mapObject(hist, function(v, x) {
      return f(x) * v;
    }));
    return expectedValue;
  }
}

function std(hist) {
  var mu = expectation(hist);
  if (_.isArray(hist)) {
    var variance = expectation(hist.map(function(x) {
      return Math.pow(x - mu, 2);
    }));
  } else {
    var variance = sum(_.mapObject(hist, function(v, x) {
      return v * Math.pow(mu - x, 2);
    }));
  }
  return Math.sqrt(variance);
}

function getOpt(optObject, option, defaultValue) {
  return (optObject && optObject[option] !== undefined) ?
      optObject[option] :
      defaultValue;
}

function mergeDefaults(options, defaults) {
  return _.defaults(options ? _.clone(options) : {}, defaults);
}

function InfToJSON(k, v) {
  if (v === Infinity) {
    return 'Infinity';
  } else if (v === -Infinity) {
    return '-Infinity';
  } else {
    return v;
  }
}

function InfFromJSON(k, v) {
  if (v === 'Infinity') {
    return Infinity;
  } else if (v === '-Infinity') {
    return -Infinity;
  } else {
    return v;
  }
}

function serialize(o) {
  return JSON.stringify(o, InfToJSON);
}

function deserialize(o) {
  return JSON.parse(o, InfFromJSON);
}

module.exports = {
  random: random,
  seedRNG: seedRNG,
  resetRNG: resetRNG,
  getRandomSeedFromEnv: getRandomSeedFromEnv,
  copyObj: copyObj,
  cpsForEach: cpsForEach,
  cpsLoop: cpsLoop,
  cpsIterate: cpsIterate,
  expectation: expectation,
  gensym: gensym,
  histsApproximatelyEqual: histsApproximatelyEqual,
  indexOfPred: indexOfPred,
  logsumexp: logsumexp,
  logHist: logHist,
  lastIndexOfPred: lastIndexOfPred,
  deleteIndex: deleteIndex,
  makeGensym: makeGensym,
  normalizeArray: normalizeArray,
  normalizeHist: normalizeHist,
  prettyJSON: prettyJSON,
  runningInBrowser: runningInBrowser,
  std: std,
  getOpt: getOpt,
  mergeDefaults: mergeDefaults,
  sum: sum,
  asArray: asArray,
  serialize: serialize,
  deserialize: deserialize
};
