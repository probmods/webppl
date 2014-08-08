(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(['PriorityQueue'], function(PriorityQueue) {
    var numberCompare;
    numberCompare = function(a, b) {
      return a - b;
    };
    describe('PriorityQueue', function() {
      it('should have a BHeapStrategy', function() {
        return expect(PriorityQueue.BHeapStrategy).toBeDefined();
      });
      it('should have a BinaryHeapStrategy', function() {
        return expect(PriorityQueue.BinaryHeapStrategy).toBeDefined();
      });
      it('should have an ArrayStrategy', function() {
        return expect(PriorityQueue.ArrayStrategy).toBeDefined();
      });
      it('should default to BinaryHeapStrategy', function() {
        var queue;
        queue = new PriorityQueue({
          comparator: numberCompare
        });
        return expect(queue.priv.constructor).toBe(PriorityQueue.BinaryHeapStrategy);
      });
      return it('should queue a default comparator', function() {
        var queue;
        queue = new PriorityQueue({
          strategy: PriorityQueue.BinaryHeapStrategy
        });
        return expect(queue.priv.comparator(2, 3)).toEqual(-1);
      });
    });
    return describe('integration tests', function() {
      var queue;
      queue = void 0;
      beforeEach(function() {
        return queue = new PriorityQueue();
      });
      return it('should stay sorted', function() {
        queue.queue(1);
        queue.queue(3);
        queue.queue(2);
        expect(queue.dequeue()).toEqual(1);
        expect(queue.dequeue()).toEqual(2);
        return expect(queue.dequeue()).toEqual(3);
      });
    });
  });

}).call(this);
