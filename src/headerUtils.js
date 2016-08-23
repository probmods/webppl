'use strict';

var _ = require('underscore');
var serialize = require('./util').serialize
var Tensor = require('./tensor');
var LRU = require('lru-cache');
var ad = require('./ad');
var assert = require('assert');
var util = require('./util');
var dists = require('./dists');

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

  // Provides a convinient wrapper around the primitive
  // registerParams.
  var tensorParam = function(s, k, a, dims, mean, sd) {

    var name = util.relativizeAddress(env, a);
    var params = util.registerParams(env, name, function() {

      mean = (mean !== undefined) ? mean : 0;
      sd = (sd !== undefined) ? sd : 0;

      // Initialization.

      var val = new Tensor(dims);
      if (sd === 0) {
        val.fill(mean);
      } else {
        for (var i = 0; i < val.length; i++) {
          val.data[i] = dists.gaussianSample(mean, sd);
        }
      }

      // registerParams tracks an array of parameters for each
      // name/address.
      return [val];

    });
    return k(s, params[0]);
  };

  // `mapData` maps a function over an array much like the `map`
  // function. It differs in that the use of `mapData` signals to the
  // language that the random choices in each `obsFn` are
  // conditionally independent given the random choices made before
  // `mapData`.

  // It is the responsibility of individual coroutines to make use of
  // this information in an appropriate way. To do so, coroutines
  // should implement the following methods:

  // mapDataFetch: Called when mapData is entered, providing an
  // opportunity to perform book-keeping etc. This method should
  // return an array of indices indicating the data to be mapped over.
  // Alternatively, null can be returned to indicate that all data
  // should be used.

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

    var batchSize = _.has(opts, 'batchSize') ? opts.batchSize : data.length;
    if (batchSize < 0 || batchSize > data.length) {
      throw new Error('mapData: Invalid batchSize.');
    }

    var ix = env.coroutine.mapDataFetch ?
        env.coroutine.mapDataFetch(data, batchSize, a) :
        null;

    assert.ok(ix === null || _.isArray(ix));

    return cpsMapData(s, function(s, v) {
      if (env.coroutine.mapDataFinal) {
        env.coroutine.mapDataFinal(a);
      }
      return k(s, v);
    }, a, data, ix, obsFn);
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
      }, a.concat('_$$' + ix), data[ix]);
    }
  }

  return {
    display: display,
    cache: cache,
    apply: apply,
    _Fn: _Fn,
    _addr: _addr,
    zeros: zeros,
    ones: ones,
    tensorParam: tensorParam,
    mapData: mapData
  };

};
