////////////////////////////////////////////////////////////////////
// Some primitive functions to make things simpler

'use strict';


module.exports = function(env) {

  function display(s, k, a, x) {
    return k(s, console.log(x));
  }

  // Caching for a wppl function f. caution: if f isn't deterministic
  // weird stuff can happen, since caching is across all uses of f, even
  // in different execuation paths.
  //FIXME: use global store for caching?
  function cache(s, k, a, f) {
    var c = {};
    var cf = function(s, k, a) {
      var args = Array.prototype.slice.call(arguments, 3);
      var stringedArgs = JSON.stringify(args);
      if (stringedArgs in c) {
        return k(s, c[stringedArgs]);
      } else {
        var newk = function(s, r) {
          c[stringedArgs] = r;
          return k(s, r);
        };
        return f.apply(this, [s, newk, a].concat(args));
      }
    };
    return k(s, cf);
  }

  // FIXME: handle fn.apply in cps transform?
  function apply(s, k, a, wpplFn, args) {
    return wpplFn.apply(global, [s, k, a].concat(args));
  }

  return {
    display: display,
    cache: cache,
    apply: apply
  };

};
