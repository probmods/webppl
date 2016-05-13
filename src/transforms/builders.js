var builders = require('ast-types').builders;
var _ = require('underscore');

function isLocationNode(node) {
  return _.has(node, 'start') && _.has(node, 'end');
}

module.exports = _.mapObject(builders, function(builder) {
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
