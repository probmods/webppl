
(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define('PriorityQueue/AbstractPriorityQueue',[],function() {
    var AbstractPriorityQueue;
    return AbstractPriorityQueue = (function() {
      function AbstractPriorityQueue(options) {
        if ((options != null ? options.strategy : void 0) == null) {
          throw 'Must pass options.strategy, a strategy';
        }
        if ((options != null ? options.comparator : void 0) == null) {
          throw 'Must pass options.comparator, a comparator';
        }
        this.priv = new options.strategy(options);
        this.length = 0;
      }

      AbstractPriorityQueue.prototype.queue = function(value) {
        this.length++;
        this.priv.queue(value);
        return void 0;
      };

      AbstractPriorityQueue.prototype.dequeue = function(value) {
        if (!this.length) {
          throw 'Empty queue';
        }
        this.length--;
        return this.priv.dequeue();
      };

      AbstractPriorityQueue.prototype.peek = function(value) {
        if (!this.length) {
          throw 'Empty queue';
        }
        return this.priv.peek();
      };

      return AbstractPriorityQueue;

    })();
  });

}).call(this);

/*
//@ sourceMappingURL=AbstractPriorityQueue.js.map
*/;
(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define('PriorityQueue/ArrayStrategy',[],function() {
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
*/;
(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define('PriorityQueue/BinaryHeapStrategy',[],function() {
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
*/;
(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define('PriorityQueue/BHeapStrategy',[],function() {
    var BHeapStrategy;
    return BHeapStrategy = (function() {
      function BHeapStrategy(options) {
        var arr, i, shift, value, _i, _j, _len, _ref, _ref1;
        this.comparator = (options != null ? options.comparator : void 0) || function(a, b) {
          return a - b;
        };
        this.pageSize = (options != null ? options.pageSize : void 0) || 512;
        this.length = 0;
        shift = 0;
        while ((1 << shift) < this.pageSize) {
          shift += 1;
        }
        if (1 << shift !== this.pageSize) {
          throw 'pageSize must be a power of two';
        }
        this._shift = shift;
        this._emptyMemoryPageTemplate = arr = [];
        for (i = _i = 0, _ref = this.pageSize; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
          arr.push(null);
        }
        this._memory = [];
        this._mask = this.pageSize - 1;
        if (options.initialValues) {
          _ref1 = options.initialValues;
          for (_j = 0, _len = _ref1.length; _j < _len; _j++) {
            value = _ref1[_j];
            this.queue(value);
          }
        }
      }

      BHeapStrategy.prototype.queue = function(value) {
        this.length += 1;
        this._write(this.length, value);
        this._bubbleUp(this.length, value);
        return void 0;
      };

      BHeapStrategy.prototype.dequeue = function() {
        var ret, val;
        ret = this._read(1);
        val = this._read(this.length);
        this.length -= 1;
        if (this.length > 0) {
          this._write(1, val);
          this._bubbleDown(1, val);
        }
        return ret;
      };

      BHeapStrategy.prototype.peek = function() {
        return this._read(1);
      };

      BHeapStrategy.prototype._write = function(index, value) {
        var page;
        page = index >> this._shift;
        while (page >= this._memory.length) {
          this._memory.push(this._emptyMemoryPageTemplate.slice(0));
        }
        return this._memory[page][index & this._mask] = value;
      };

      BHeapStrategy.prototype._read = function(index) {
        return this._memory[index >> this._shift][index & this._mask];
      };

      BHeapStrategy.prototype._bubbleUp = function(index, value) {
        var compare, indexInPage, parentIndex, parentValue;
        compare = this.comparator;
        while (index > 1) {
          indexInPage = index & this._mask;
          if (index < this.pageSize || indexInPage > 3) {
            parentIndex = (index & ~this._mask) | (indexInPage >> 1);
          } else if (indexInPage < 2) {
            parentIndex = (index - this.pageSize) >> this._shift;
            parentIndex += parentIndex & ~(this._mask >> 1);
            parentIndex |= this.pageSize >> 1;
          } else {
            parentIndex = index - 2;
          }
          parentValue = this._read(parentIndex);
          if (compare(parentValue, value) < 0) {
            break;
          }
          this._write(parentIndex, value);
          this._write(index, parentValue);
          index = parentIndex;
        }
        return void 0;
      };

      BHeapStrategy.prototype._bubbleDown = function(index, value) {
        var childIndex1, childIndex2, childValue1, childValue2, compare;
        compare = this.comparator;
        while (index < this.length) {
          if (index > this._mask && !(index & (this._mask - 1))) {
            childIndex1 = childIndex2 = index + 2;
          } else if (index & (this.pageSize >> 1)) {
            childIndex1 = (index & ~this._mask) >> 1;
            childIndex1 |= index & (this._mask >> 1);
            childIndex1 = (childIndex1 + 1) << this._shift;
            childIndex2 = childIndex1 + 1;
          } else {
            childIndex1 = index + (index & this._mask);
            childIndex2 = childIndex1 + 1;
          }
          if (childIndex1 !== childIndex2 && childIndex2 <= this.length) {
            childValue1 = this._read(childIndex1);
            childValue2 = this._read(childIndex2);
            if (compare(childValue1, value) < 0 && compare(childValue1, childValue2) <= 0) {
              this._write(childIndex1, value);
              this._write(index, childValue1);
              index = childIndex1;
            } else if (compare(childValue2, value) < 0) {
              this._write(childIndex2, value);
              this._write(index, childValue2);
              index = childIndex2;
            } else {
              break;
            }
          } else if (childIndex1 <= this.length) {
            childValue1 = this._read(childIndex1);
            if (compare(childValue1, value) < 0) {
              this._write(childIndex1, value);
              this._write(index, childValue1);
              index = childIndex1;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        return void 0;
      };

      return BHeapStrategy;

    })();
  });

}).call(this);

/*
//@ sourceMappingURL=BHeapStrategy.js.map
*/;
(function() {
  var define,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define('PriorityQueue',['./PriorityQueue/AbstractPriorityQueue', './PriorityQueue/ArrayStrategy', './PriorityQueue/BinaryHeapStrategy', './PriorityQueue/BHeapStrategy'], function(AbstractPriorityQueue, ArrayStrategy, BinaryHeapStrategy, BHeapStrategy) {
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
*/;