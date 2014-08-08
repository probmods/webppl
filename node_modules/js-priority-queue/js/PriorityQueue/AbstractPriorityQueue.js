(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(function() {
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
*/