(function() {
  window.StrategyHelper = (function() {
    var numberComparator, queueToArray;
    numberComparator = function(a, b) {
      if ((a == null) || (b == null)) {
        throw 'Invalid compare';
      }
      return a - b;
    };
    queueToArray = function(queue, nElements) {
      var i, _i, _results;
      _results = [];
      for (i = _i = 0; 0 <= nElements ? _i < nElements : _i > nElements; i = 0 <= nElements ? ++_i : --_i) {
        _results.push(queue.dequeue());
      }
      return _results;
    };
    return {
      describeStrategy: function(description, strategy) {
        return describe(description, function() {
          var priv;
          priv = void 0;
          describe('with initial values', function() {
            beforeEach(function() {
              return priv = new strategy({
                comparator: numberComparator,
                initialValues: [5, 2, 3, 4, 1, 6, 7]
              });
            });
            return it('should dequeue the initial values in order', function() {
              return expect(queueToArray(priv, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
            });
          });
          return describe('starting with some elements', function() {
            beforeEach(function() {
              priv = new strategy({
                comparator: numberComparator
              });
              priv.queue(3);
              priv.queue(1);
              priv.queue(7);
              priv.queue(2);
              priv.queue(6);
              return priv.queue(5);
            });
            describe('peek', function() {
              it('should see the first element', function() {
                return expect(priv.peek()).toEqual(1);
              });
              return it('should not remove the first element', function() {
                priv.peek();
                return expect(priv.peek()).toEqual(1);
              });
            });
            describe('dequeue', function() {
              return it('should dequeue elements in order', function() {
                expect(priv.dequeue()).toEqual(1);
                expect(priv.dequeue()).toEqual(2);
                return expect(priv.dequeue()).toEqual(3);
              });
            });
            return describe('queue', function() {
              it('should queue at the beginning', function() {
                priv.queue(0.5);
                return expect(queueToArray(priv, 4)).toEqual([0.5, 1, 2, 3]);
              });
              it('should queue at the middle', function() {
                priv.queue(1.5);
                return expect(queueToArray(priv, 4)).toEqual([1, 1.5, 2, 3]);
              });
              it('should queue at the end', function() {
                priv.queue(3.5);
                return expect(queueToArray(priv, 4)).toEqual([1, 2, 3, 3.5]);
              });
              it('should queue a duplicate at the beginning', function() {
                priv.queue(1);
                return expect(queueToArray(priv, 4)).toEqual([1, 1, 2, 3]);
              });
              it('should queue a duplicate in the middle', function() {
                priv.queue(2);
                return expect(queueToArray(priv, 4)).toEqual([1, 2, 2, 3]);
              });
              return it('should queue a duplicate at the end', function() {
                priv.queue(3);
                return expect(queueToArray(priv, 4)).toEqual([1, 2, 3, 3]);
              });
            });
          });
        });
      }
    };
  })();

}).call(this);
