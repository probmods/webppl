(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(function() {
    var ArrayStrategy, binarySearchForIndexReversed;
    binarySearchForIndexReversed = function(array, value, comparator) {
      var high, low, mid;
      low = 0;
      high = array.length;
      while (low < high) {
        mid = (low + high) >>> 1;
        if (comparator(array[mid], value) >= 0) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    };
    return ArrayStrategy = (function() {
      function ArrayStrategy(options) {
        var _ref;
        this.options = options;
        this.comparator = this.options.comparator;
        this.data = ((_ref = this.options.initialValues) != null ? _ref.slice(0) : void 0) || [];
        this.data.sort(this.comparator).reverse();
      }

      ArrayStrategy.prototype.queue = function(value) {
        var pos;
        pos = binarySearchForIndexReversed(this.data, value, this.comparator);
        this.data.splice(pos, 0, value);
        return void 0;
      };

      ArrayStrategy.prototype.dequeue = function() {
        return this.data.pop();
      };

      ArrayStrategy.prototype.peek = function() {
        return this.data[this.data.length - 1];
      };

      return ArrayStrategy;

    })();
  });

}).call(this);

/*
//@ sourceMappingURL=ArrayStrategy.js.map
*/