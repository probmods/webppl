'use strict';

var _ = require('lodash');
var serialize = require('./util').serialize
var Tensor = require('./tensor');
var LRU = require('lru-cache');
var ad = require('./ad');
var assert = require('assert');
var runThunk = require('./guide').runThunk;

module.exports = function(env) {

  function display(s, k, a, x) {
    return k(s, console.log(ad.valueRec(x)));
  }

  // Caching for a wppl function f.
  //
  // Caution: if f isn't deterministic weird stuff can happen, since
  // caching is across all uses of f, even in different execuation
  // paths.
  function cache(s, k, a, f, maxSize) {
    var c = LRU(maxSize);
    var cf = function(s, k, a) {
      var args = Array.prototype.slice.call(arguments, 3);
      var stringedArgs = serialize(args);
      if (c.has(stringedArgs)) {
        return k(s, c.get(stringedArgs));
      } else {
        var newk = function(s, r) {
          if (c.has(stringedArgs)) {
            // This can happen when cache is used on recursive functions
            console.log('Already in cache:', stringedArgs);
            if (serialize(c.get(stringedArgs)) !== serialize(r)) {
              console.log('OLD AND NEW CACHE VALUE DIFFER!');
              console.log('Old value:', c.get(stringedArgs));
              console.log('New value:', r);
            }
          }
          c.set(stringedArgs, r);
          if (!maxSize && c.length === 1e4) {
            console.log(c.length + ' function calls have been cached.');
            console.log('The size of the cache can be limited by calling cache(f, maxSize).');
          }
          return k(s, r);
        };
        return f.apply(this, [s, newk, a].concat(args));
      }
    };
    return k(s, cf);
  }

  function apply(s, k, a, wpplFn, args) {
    return wpplFn.apply(global, [s, k, a].concat(args));
  }

  function notAllowed(fn, name) {
    return function() {
      throw new Error(fn + ' is not allowed in ' + name + '.');
    };
  }

  function makeDeterministicCoroutine(name) {
    return {
      sample: notAllowed('sample', name),
      factor: notAllowed('factor', name),
      incrementalize: env.defaultCoroutine.incrementalize
    };
  }

  // Applies a deterministic function. Attempts by wpplFn to call
  // sample or factor generate an error.
  function applyd(s, k, a, wpplFn, args, name) {
    var coroutine = env.coroutine;
    env.coroutine = makeDeterministicCoroutine(name);
    return apply(s, function(s, val) {
      env.coroutine = coroutine;
      return k(s, val);
    }, a, wpplFn, args);
  }

  // Annotating a function object with its lexical id and
  //    a list of its free variable values.
  var __uniqueid = 0;
  var _Fn = {
    tag: function(fn, lexid, freevarvals) {
      fn.__lexid = lexid;
      fn.__uniqueid = __uniqueid++;
      fn.__freeVarVals = freevarvals;
      return fn;
    }
  };

  // Called from compiled code to save the current address in the
  // container `obj`.
  var _addr = {
    save: function(obj, address) {
      obj.value = address;
    }
  };

  var zeros = function(s, k, a, dims) {
    return k(s, new Tensor(dims));
  };

  var ones = function(s, k, a, dims) {
    return k(s, new Tensor(dims).fill(1));
  };

  // It is the responsibility of individual coroutines to implement
  // data sub-sampling and to make use of the conditional independence
  // information mapData provides. To do so, coroutines can implement
  // one or more of the following methods:

  // mapDataFetch: Called when mapData is entered, providing an
  // opportunity to perform book-keeping etc. The method should return
  // an object with data, ix and (optional) address properties.

  //   data: The array that will be mapped over.

  //   ix: An array of integers of the same length as data, where each
  //   entry indicates the position at which the corresponding entry
  //   in data can be found in the original data array. This is used
  //   to ensure that corresponding data items and stack addresses are
  //   used when applying the observation function. For convenience,
  //   null can be returned as a short hand for _.range(data.length).

  //   address: When present, mapData behaves as though it was called
  //   from this address.

  // mapDataEnter/mapDataLeave: Called before/after every application
  // of the observation function.

  // mapDataFinal: Called once all data have been mapped over.

  // When the current coroutine doesn't provide specific handling the
  // behavior is equivalent to regular `map`.

  // This is still somewhat experimental. The interface may change in
  // the future.

  function mapData(s, k, a, opts, obsFn) {
    opts = opts || {};

    var data = opts.data;
    if (!_.isArray(data)) {
      throw new Error('mapData: No data given.');
    }

    var ret = env.coroutine.mapDataFetch ?
        env.coroutine.mapDataFetch(data, opts, a) :
        {data: data, ix: null};

    var ix = ret.ix;
    var finalData = ret.data;
    var address = ret.address || a;

    assert.ok(ix === null ||
              (_.isArray(ix) && (ix.length === finalData.length)),
              'Unexpected value returned by mapDataFetch.');

    // We return undefined when sub-sampling data etc.
    var doReturn = finalData === data;

    return cpsMapData(s, function(s, v) {
      if (env.coroutine.mapDataFinal) {
        env.coroutine.mapDataFinal(a);
      }
      return k(s, doReturn ? v : undefined);
    }, address, finalData, ix, obsFn);
  }

  function cpsMapData(s, k, a, data, indices, f, acc, i) {
    i = (i === undefined) ? 0 : i;
    acc = (acc === undefined) ? [] : acc;
    var length = (indices === null) ? data.length : indices.length;
    if (i === length) {
      return k(s, acc);
    } else {
      var ix = (indices === null) ? i : indices[i];
      if (env.coroutine.mapDataEnter) {
        env.coroutine.mapDataEnter();
      }
      return f(s, function(s, v) {
        if (env.coroutine.mapDataLeave) {
          env.coroutine.mapDataLeave();
        }

        return function() {
          return cpsMapData(s, k, a, data, indices, f, acc.concat([v]), i + 1);
        };
      }, a.concat('_$$' + ix), data[i], ix);
    }
  }

  function guide(s, k, a, thunk) {
    if (env.coroutine.guideRequired) {
      return runThunk(thunk, env, s, a, function(s2, val) {
        return k(s2);
      });
    } else {
      return k(s);
    }
  }

  return {
    display: display,
    cache: cache,
    apply: apply,
    applyd: applyd,
    _Fn: _Fn,
    _addr: _addr,
    zeros: zeros,
    ones: ones,
    mapData: mapData,
    guide: guide
  };

};
