'use strict';

var _ = require('lodash');

// `prepare` takes an array of callback objects that looks like this:

// [
//   {setup: function(arg) {}, iteration: function(arg) {}},
//   ...
// ]

// And returns a single object that is operationally equivalent to
// this:

// {
//   setup: function(arg) { _.invokeMap(callbacks, 'setup', arg); },
//   iteration: function(arg) { _.invokeMap(callbacks, 'iteration', arg); },
//   ...
// }

// The actual implementation aims to improve on this by avoiding
// traversing the array of callback objects each time an event is
// trigger when we know ahead of time that none of the objects include
// handlers for the event.

var prepareOne = function(name, callbacks) {
  var fns = [];
  callbacks.forEach(function(obj) {
    if (_.has(obj, name)) {
      fns.push(obj[name]);
    }
  });
  if (_.isEmpty(fns)) {
    return _.noop;
  } else {
    return function(arg) {
      fns.forEach(function(f) { f(arg); });
    };
  }
};

var names = ['setup', 'initialize', 'iteration', 'sample', 'finish'];

var prepare = function(callbacks) {
  return _.fromPairs(names.map(function(name) {
    return [name, prepareOne(name, callbacks)];
  }));
};

module.exports = {
  prepare: prepare
};
