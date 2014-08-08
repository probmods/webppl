(function() {
  var define;

  if (typeof define === "undefined" || define === null) {
    define = require('amdefine')(module);
  }

  define(['PriorityQueue/AbstractPriorityQueue'], function(AbstractPriorityQueue) {
    var numberCompare;
    numberCompare = function(a, b) {
      return a - b;
    };
    return describe('AbstractPriorityQueue', function() {
      it('should throw if there is no strategy', function() {
        return expect(function() {
          return new AbstractPriorityQueue({
            comparator: numberCompare
          });
        }).toThrow();
      });
      it('should throw if there is no comparator', function() {
        return expect(function() {
          return new AbstractPriorityQueue({
            strategy: (function() {})
          });
        }).toThrow();
      });
      return describe('with a queue', function() {
        var MockStrategy, queue, strategy;
        queue = void 0;
        strategy = void 0;
        MockStrategy = (function() {
          function MockStrategy(options) {
            this.options = options;
            strategy = this;
          }

          MockStrategy.prototype.queue = function() {};

          MockStrategy.prototype.dequeue = function() {};

          MockStrategy.prototype.peek = function() {};

          return MockStrategy;

        })();
        return beforeEach(function() {
          queue = new AbstractPriorityQueue({
            comparator: numberCompare,
            strategy: MockStrategy
          });
          it('should pass the options to the strategy', function() {
            return expect(strategy.options.comparator).toBe(numberCompare);
          });
          it('should have length 0', function() {
            return expect(queue.length).toEqual(0);
          });
          it('should call strategy.queue', function() {
            strategy.queue = jasmine.createSpy();
            queue.queue(3);
            return expect(strategy.queue).toHaveBeenCalledWith(3);
          });
          it('should set length=0 on queue', function() {
            queue.queue(3);
            return expect(queue.length).toEqual(3);
          });
          it('should throw when dequeue is called and length is 0', function() {
            return expect(function() {
              return queue.dequeue();
            }).toThrow('Empty queue');
          });
          it('should call strategy.dequeue', function() {
            var value;
            queue.length = 4;
            strategy.dequeue = jasmine.createSpy().andReturn('x');
            value = queue.dequeue();
            expect(strategy.dequeue).toHaveBeenCalled();
            return expect(value).toEqual('x');
          });
          it('should set length when calling dequeue', function() {
            queue.length = 3;
            queue.dequeue();
            return expect(queue.length).toEqual(2);
          });
          it('should throw when peek is called and length is 0', function() {
            return expect(function() {
              return queue.peek();
            }).toThrow('Empty queue');
          });
          it('should call strategy.peek', function() {
            var value;
            queue.length = 1;
            strategy.peek = jasmine.createSpy().andReturn('x');
            value = queue.peek();
            expect(strategy.peek).toHaveBeenCalled();
            return expect(value).toEqual('x');
          });
          return it('should not change length when calling peek', function() {
            queue.length = 1;
            queue.peek();
            return expect(queue.length).toEqual(1);
          });
        });
      });
    });
  });

}).call(this);
