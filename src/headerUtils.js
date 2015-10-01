'use strict';


module.exports = function(env) {

  function display(s, k, a, x) {
    return k(s, console.log(x));
  }

  // Caching for a wppl function f.
  //
  // Caution: if f isn't deterministic weird stuff can happen, since
  // caching is across all uses of f, even in different execuation
  // paths.
  function cache(s, k, a, f) {
    var c = {};
    var cf = function(s, k, a) {
      var args = Array.prototype.slice.call(arguments, 3);
      var stringedArgs = JSON.stringify(args);
      if (stringedArgs in c) {
        return k(s, c[stringedArgs]);
      } else {
        var newk = function(s, r) {
          if (stringedArgs in c) {
            // This can happen when cache is used on recursive functions
            console.log('Already in cache:', stringedArgs);
            if (JSON.stringify(c[stringedArgs]) !== JSON.stringify(r)) {
              console.log('OLD AND NEW CACHE VALUE DIFFER!');
              console.log('Old value:', c[stringedArgs]);
              console.log('New value:', r);
            }
          }
          c[stringedArgs] = r;
          return k(s, r);
        };
        return f.apply(this, [s, newk, a].concat(args));
      }
    };
    return k(s, cf);
  }

  // Stochastic caching for a wppl function.
  // recompProb - if found in cache, recompute with this prob
  // aggregator - when recomputing, aggregate(oldval, newval)
  // **warning** avoid use on recursive functions
  // **warning** aggregator should ideally be monoid because order can
  //             be weird when f is not deterministic
  function stochasticCache(s, k, a, f, aggregator, recompProb) {
    var c = {};
    var cf = function(s, k, a) {
      var args = Array.prototype.slice.call(arguments, 3);
      var stringedArgs = JSON.stringify(args);
      var foundInCache = stringedArgs in c;
      var recomp = util.random() < recompProb;
      if (foundInCache && !recomp) {      // return stored value
        return k(s, c[stringedArgs]);
      } else {                           // recompute
        var newk = function(s, r) {
          var prev = foundInCache ? c[stringedArgs] : null;
          var nk = function(s, v) {
            c[stringedArgs] = v;
            return k(s, v);
          };
          if (foundInCache) {           // aggregate with prev value
            return aggregator.apply(this, [s, nk, a].concat([prev, r]))
          } else {                      // just return current value
            return nk(s, r);
          }
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

  return {
    display: display,
    cache: cache,
    stochasticCache: stochasticCache,
    apply: apply,
    _Fn: _Fn
  };

};
