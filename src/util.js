'use strict';

var _ = require('underscore');
var assert = require('assert');
var seedrandom = require('seedrandom');

var rng = Math.random;

var trampolineRunners = {
  web: function f(t) {
    var lastPauseTime = Date.now();

    if (f.__cancel__) {
      f.__cancel__ = false;
    } else {
      while (t) {
        var currTime = Date.now();
        if (currTime - lastPauseTime > 100) {
          // NB: return is crucial here as it exits the while loop
          // and i'm using return rather than break because we might
          // one day want to cancel the timer
          return setTimeout(function() { f(t) }, 0);
        } else {
          t = t();
        }
      }
    }
  },
  cli: function(t) {
    while (t) {
      t = t()
    }
  }
}



function random() {
  return rng();
}

function seedRNG(seed) {
  rng = seedrandom(seed);
}

function resetRNG() {
  rng = Math.random;
}

function assertValidRandomSeed(seed) {
  var msg = 'Random seed should be a positive integer.';
  assert(_.isFinite(seed) && seed >= 0, msg);
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

function product(xs) {
  var result = 1;
  for (var i = 0, n = xs.length; i < n; i++) {
    result *= xs[i];
  }
  return result;
}

function logsumexp(a) {
  var m = Math.max.apply(null, a);
  var sum = 0;
  for (var i = 0; i < a.length; ++i) {
    sum += (a[i] === -Infinity ? 0 : Math.exp(a[i] - m));
  }
  return m + Math.log(sum);
}

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

function histExpectation(hist, func) {
  var f = func || _.identity;
  return _.reduce(hist, function(acc, obj) {
    return acc + obj.prob * f(obj.val);
  }, 0);
}

function histStd(hist) {
  var m = histExpectation(hist);
  return Math.sqrt(histExpectation(hist, function(x) {
    return Math.pow(x - m, 2);
  }));
}

function histsApproximatelyEqual(actualHist, expectedHist, tolerance) {
  var allOk = (expectedHist !== undefined);
  _.each(
      expectedHist,
      function(expectedValue, key) {
        var value = actualHist[key] || 0;
        var testPassed = Math.abs(value - expectedValue) <= tolerance;
        allOk = allOk && testPassed;
      });
  return allOk;
}

function mergeDefaults(options, defaults) {
  return _.defaults(options ? _.clone(options) : {}, defaults);
}

function throwUnlessOpts(options, fnName) {
  assert.ok(fnName);
  if (options !== undefined && !_.isObject(options)) {
    throw fnName + ' expected an options object but received: ' + JSON.stringify(options);
  }
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

function time(name, thunk) {
  if (console.time) {
    console.time(name);
    var ret = thunk();
    console.timeEnd(name);
    return ret;
  } else {
    return thunk();
  }
}

function timeif(bool, name, thunk) {
  return bool ? time(name, thunk) : thunk();
}

function pipeline(fns) {
  return _.compose.apply(null, fns.reverse());
}

function warn(msg) {
  if (!global.suppressWarnings) {
    console.warn(msg)
  }
}

function jsnew(ctor, arg) {
  return new ctor(arg);
}

module.exports = {
  trampolineRunners: trampolineRunners,
  random: random,
  seedRNG: seedRNG,
  resetRNG: resetRNG,
  assertValidRandomSeed: assertValidRandomSeed,
  cpsForEach: cpsForEach,
  cpsLoop: cpsLoop,
  cpsIterate: cpsIterate,
  histExpectation: histExpectation,
  histStd: histStd,
  histsApproximatelyEqual: histsApproximatelyEqual,
  gensym: gensym,
  logsumexp: logsumexp,
  deleteIndex: deleteIndex,
  makeGensym: makeGensym,
  prettyJSON: prettyJSON,
  runningInBrowser: runningInBrowser,
  mergeDefaults: mergeDefaults,
  throwUnlessOpts: throwUnlessOpts,
  sum: sum,
  product: product,
  asArray: asArray,
  serialize: serialize,
  deserialize: deserialize,
  timeif: timeif,
  pipeline: pipeline,
  warn: warn,
  jsnew: jsnew
};
