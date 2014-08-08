(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(function() {
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
*/