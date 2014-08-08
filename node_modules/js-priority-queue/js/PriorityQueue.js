(function() {
  var define,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(['./PriorityQueue/AbstractPriorityQueue', './PriorityQueue/ArrayStrategy', './PriorityQueue/BinaryHeapStrategy', './PriorityQueue/BHeapStrategy'], function(AbstractPriorityQueue, ArrayStrategy, BinaryHeapStrategy, BHeapStrategy) {
    var PriorityQueue;
    PriorityQueue = (function(_super) {
      __extends(PriorityQueue, _super);

      function PriorityQueue(options) {
        options || (options = {});
        options.strategy || (options.strategy = BinaryHeapStrategy);
        options.comparator || (options.comparator = function(a, b) {
          return (a || 0) - (b || 0);
        });
        PriorityQueue.__super__.constructor.call(this, options);
      }

      return PriorityQueue;

    })(AbstractPriorityQueue);
    PriorityQueue.ArrayStrategy = ArrayStrategy;
    PriorityQueue.BinaryHeapStrategy = BinaryHeapStrategy;
    PriorityQueue.BHeapStrategy = BHeapStrategy;
    return PriorityQueue;
  });

}).call(this);

/*
//@ sourceMappingURL=PriorityQueue.js.map
*/