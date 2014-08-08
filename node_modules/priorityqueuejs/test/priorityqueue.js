describe('PriorityQueue()', function() {
  it('returns an new PriorityQueue', function() {
    expect(new PriorityQueue()).to.be.a(PriorityQueue);
  });

  it('accepts a comparator function', function() {
    var queue = new PriorityQueue(function(a, b) {
      return a - b;
    });

    expect(queue).to.be.a(PriorityQueue);
  });

  describe('.DEFAULT_COMPARATOR()', function() {
    context('given strings', function() {
      it('returns a negative number when a < b', function() {
        expect(PriorityQueue.DEFAULT_COMPARATOR('jano', 'valentina')).to.be.
          below(0);
      });

      it('returns 0 number when a == b', function() {
        expect(PriorityQueue.DEFAULT_COMPARATOR('jano', 'jano')).to.be(0);
      });

      it('returns a positive number when a > b', function() {
        expect(PriorityQueue.DEFAULT_COMPARATOR('jano', 'fran')).to.be.
          above(0);
      });
    });

    context('given numbers', function() {
      it('returns a negative number when a < b', function() {
        expect(PriorityQueue.DEFAULT_COMPARATOR(10, 1000)).to.be.below(0);
      });

      it('returns 0 number when a == b', function() {
        expect(PriorityQueue.DEFAULT_COMPARATOR(10, 10)).to.be(0);
      });

      it('returns a positive number when a > b', function() {
        expect(PriorityQueue.DEFAULT_COMPARATOR(10, 1)).to.be.above(0);
      });
    });
  });

  describe('#isEmpty()', function() {
    it('returns true when the queue is empty', function() {
      var queue = new PriorityQueue();
      expect(queue.isEmpty()).to.be(true);
    });

    it('returns false when the queue is not empty', function() {
      var queue = new PriorityQueue();
      queue.enq('jano');
      expect(queue.isEmpty()).to.be(false);
    });
  });

  describe('#peek()', function() {
    it('fails when the queue is empty', function() {
      var queue = new PriorityQueue();
      expect(function() {
        queue.peek();
      }).to.throwException('PriorityQueue is empty');
    });

    it('returns the top element of the queue', function() {
      var queue = new PriorityQueue();
      queue.enq('jano');
      queue.enq('valentina');
      queue.enq('zombie');
      queue.enq('fran');
      queue.enq('albert');
      queue.enq('albert');
      queue.enq('frank');
      expect(queue.peek()).to.be('zombie');
    });
  });

  describe('#deq()', function() {
    it('fails when the queue is empty', function() {
      var queue = new PriorityQueue();
      expect(function() {
        queue.deq();
      }).to.throwException('PriorityQueue is empty');
    });

    it('dequeues the top element of the queue', function() {
      var queue = new PriorityQueue();
      queue.enq('jano');
      queue.enq('valentina');
      queue.enq('zombie');
      queue.enq('fran');
      queue.enq('albert');
      queue.enq('albert');
      queue.enq('frank');
      queue.enq('jano');
      queue.enq('valentina');
      queue.enq('zombie');
      expect(queue.deq()).to.be('zombie');
      expect(queue.deq()).to.be('zombie');
      expect(queue.deq()).to.be('valentina');
      expect(queue.deq()).to.be('valentina');
      expect(queue.deq()).to.be('jano');
      expect(queue.deq()).to.be('jano');
      expect(queue.deq()).to.be('frank');
      expect(queue.deq()).to.be('fran');
      expect(queue.deq()).to.be('albert');
      expect(queue.deq()).to.be('albert');
      expect(queue.isEmpty()).to.be(true);
    });

    it('not fails with only one element', function() {
      var queue = new PriorityQueue();
      queue.enq('jano');
      expect(queue.deq()).to.be('jano');
      expect(queue.size()).to.be(0);
    });

    it('works with custom comparators', function() {
      var queue = new PriorityQueue(function(a, b) {
        return b.priority - a.priority;
      });

      queue.enq({ priority: 100 });
      queue.enq({ priority: -1 });
      queue.enq({ priority: 0 });
      queue.enq({ priority: 5 });
      expect(queue.deq()).to.be.eql({ priority: -1 });
      expect(queue.deq()).to.be.eql({ priority: 0 });
      expect(queue.deq()).to.be.eql({ priority: 5 });
      expect(queue.deq()).to.be.eql({ priority: 100 });
      expect(queue.isEmpty()).to.be(true);
    });
  });

  describe('#enq()', function() {
    it('enqueues an element at the end of the queue', function() {
      var queue = new PriorityQueue();
      queue.enq('jano');
      queue.enq('valentina');
      queue.enq('fran');
      expect(queue.peek()).to.be('valentina');
      expect(queue.size()).to.be(3);
    });

    it('returns the new size of the queue', function() {
      var queue = new PriorityQueue();
      expect(queue.enq('jano')).to.be(1);
    });

    it('works with custom comparators', function() {
      var queue = new PriorityQueue(function(a, b) {
        return b.priority - a.priority;
      });

      queue.enq({ priority: 100 });
      queue.enq({ priority: -1 });
      queue.enq({ priority: 0 });
      queue.enq({ priority: 5 });
      expect(queue.peek()).to.be.eql({ priority: -1 });
      expect(queue.size()).to.be(4);
    });
  });

  describe('#size()', function() {
    it('returns 0 when the queue is empty', function() {
      var queue = new PriorityQueue();
      expect(queue.size()).to.be(0);
    });

    it('returns the size of the queue', function() {
      var queue = new PriorityQueue();
      queue.enq('jano');
      queue.enq('valentina');
      expect(queue.size()).to.be(2);
    });
  });

  describe('#forEach()', function() {
    it('iterates over all queue elements', function () {
      var queue = new PriorityQueue();
      queue.enq('a');
      queue.enq('b');
      var iteration = [];

      queue.forEach(function(element, index) {
        iteration.push([element, index]);
      });

      expect(iteration.length).to.be(2);
      expect(iteration[0][0]).to.be.eql('b');
      expect(iteration[0][1]).to.be.eql(0);
      expect(iteration[1][0]).to.be.eql('a');
      expect(iteration[1][1]).to.be.eql(1);
    });
  });
});
