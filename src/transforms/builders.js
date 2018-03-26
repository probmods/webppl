'use strict';

var builders = require('ast-types').builders;
var _ = require('lodash');

// The ast-type builders don't provide a convenient way to set the
// source location of a built node. As a work-around, we wrap each
// builder function with a new function that takes the source location
// as an extra argument and adds it to the new node. The source
// location argument is optional, and is given as the final argument
// when present.

function isLocationNode(node) {
  return _.has(node, 'start') && _.has(node, 'end');
}

module.exports = _.mapValues(builders, function(builder) {
  return function() {
    var args = _.toArray(arguments);
    if (args.length > 0 && isLocationNode(_.last(args))) {
      var node = builder.apply(null, args.slice(0, -1));
      node.loc = _.last(args);
      return node;
    } else {
      return builder.apply(null, args);
    }
  };
});
