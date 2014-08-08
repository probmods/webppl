(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(function() {
    var BinaryHeapStrategy;
    return BinaryHeapStrategy = (function() {
      function BinaryHeapStrategy(options) {
        var _ref;
        this.comparator = (options != null ? options.comparator : void 0) || function(a, b) {
          return a - b;
        };
        this.length = 0;
        this.data = ((_ref = options.initialValues) != null ? _ref.slice(0) : void 0) || [];
        this._heapify();
      }

      BinaryHeapStrategy.prototype._heapify = function() {
        var i, _i, _ref;
        if (this.data.length > 0) {
          for (i = _i = 1, _ref = this.data.length; 1 <= _ref ? _i < _ref : _i > _ref; i = 1 <= _ref ? ++_i : --_i) {
            this._bubbleUp(i);
          }
        }
        return void 0;
      };

      BinaryHeapStrategy.prototype.queue = function(value) {
        this.data.push(value);
        this._bubbleUp(this.data.length - 1);
        return void 0;
      };

      BinaryHeapStrategy.prototype.dequeue = function() {
        var last, ret;
        ret = this.data[0];
        last = this.data.pop();
        if (this.data.length > 0) {
          this.data[0] = last;
          this._bubbleDown(0);
        }
        return ret;
      };

      BinaryHeapStrategy.prototype.peek = function() {
        return this.data[0];
      };

      BinaryHeapStrategy.prototype._bubbleUp = function(pos) {
        var parent, x;
        while (pos > 0) {
          parent = (pos - 1) >>> 1;
          if (this.comparator(this.data[pos], this.data[parent]) < 0) {
            x = this.data[parent];
            this.data[parent] = this.data[pos];
            this.data[pos] = x;
            pos = parent;
          } else {
            break;
          }
        }
        return void 0;
      };

      BinaryHeapStrategy.prototype._bubbleDown = function(pos) {
        var last, left, minIndex, right, x;
        last = this.data.length - 1;
        while (true) {
          left = (pos << 1) + 1;
          right = left + 1;
          minIndex = pos;
          if (left <= last && this.comparator(this.data[left], this.data[minIndex]) < 0) {
            minIndex = left;
          }
          if (right <= last && this.comparator(this.data[right], this.data[minIndex]) < 0) {
            minIndex = right;
          }
          if (minIndex !== pos) {
            x = this.data[minIndex];
            this.data[minIndex] = this.data[pos];
            this.data[pos] = x;
            pos = minIndex;
          } else {
            break;
          }
        }
        return void 0;
      };

      return BinaryHeapStrategy;

    })();
  });

}).call(this);

/*
//@ sourceMappingURL=BinaryHeapStrategy.js.map
*/