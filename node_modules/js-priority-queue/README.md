Priority Queue
==============

A priority queue is a data structure with these operations:

| Operation | Syntax (js-priority-queue) | Description |
| --------- | --- | ----------- |
| Create | `var queue = new PriorityQueue();` | Creates a priority queue |
| Queue | `queue.queue(value);` | Inserts a new value in the queue |
| Length | `var length = queue.length;` | Returns the number of elements in the queue |
| Peek | `var firstItem = queue.peek();` | Returns the smallest item in the queue and leaves the queue unchanged |
| Dequeue | `var firstItem = queue.dequeue();` | Returns the smallest item in the queue and removes it from the queue |

You cannot access the data in any other way: you must dequeue or peek.

Why use this library? Two reasons:

1. It's easier to use than an Array, and it's clearer.
2. It can make your code execute more quickly.

Installing
==========

Download `priority-queue.js`. Alternatively, install through Bower:
`bower install js-priority-queue`

Include it through [RequireJS](http://requirejs.org/).

Then write code like this:

    require([ 'vendor/priority-queue' ], function(PriorityQueue) {
      var queue = new PriorityQueue({ comparator: function(a, b) { return b - a; }});
      queue.queue(5);
      queue.queue(3);
      queue.queue(2);
      var lowest = queue.dequeue(); // returns 5
    });

If you don't like RequireJS, you can download the standalone version,
`priority-queue.no-require.js`, and write:

    var queue = new PriorityQueue({ comparator: function(a, b) { return b - a; }});
    queue.queue(5);
    queue.queue(3);
    queue.queue(2);
    var lowest = queue.dequeue(); // returns 5

Options
=======

How exactly will these elements be ordered? Let's use the `comparator` option.
This is the argument we would pass to
[Array.prototype.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort):

    var compareNumbers = function(a, b) { return a - b; };
    var queue = new PriorityQueue({ comparator: compareNumbers });

You can also pass initial values, in any order. With lots of values, it's
faster to load them all at once than one at a time.

    var queue = new PriorityQueue({ initialValues: [ 1, 2, 3 ] })

Strategies
==========

We can implement this with a regular `Array`. We'll keep it sorted inversely,
so `queue.dequeue()` maps to `array.pop()`.

But with an `Array`, we'll need to `splice()`, which can affect every single
element in the array. An alternative is to create a
[Binary Heap](http://en.wikipedia.org/wiki/Binary_heap), which writes far
fewer array elements when queueing (though each element is written more slowly).

Finally, we can use a [B-Heap](http://en.wikipedia.org/wiki/B-heap). It's like a
binary heap, except it orders elements such that during a single operation,
writes occur closer to each other in memory. Unfortunately, it's slower to
calculate where in memory each write should occur (it costs a function call
instead of a bit-shift). So while it's fast in theory, it's slower in practice.

Create the queues like this:

    var queue = new PriorityQueue({ strategy: PriorityQueue.ArrayStrategy }); // Array
    var queue = new PriorityQueue({ strategy: PriorityQueue.BinaryHeapStrategy }); // Default
    var queue = new PriorityQueue({ strategy: PriorityQueue.BHeapStrategy }); // Slower

You'll see running times like this:

| Operation | Array | Binary heap | B-Heap |
| --------- | ----- | ----------- | -------------- |
| Create | O(n lg n) | O(n) | O(n) |
| Queue | O(n) (often slow) | O(lg n) (fast) | O(lg n) |
| Peek | O(1) | O(1) | O(1) |
| Dequeue | O(1) (fast) | O(lg n) | O(lg n) |

According to [JsPerf](http://jsperf.com/js-priority-queue-queue-dequeue), the
fastest strategy for most cases is `BinaryHeapStrategy`. Only use `ArrayStrategy`
only if you're queuing items in a very particular order. Don't use
`BHeapStrategy`, except as a lesson in how sometimes miracles in one
programming language aren't great in other languages.

Contributing
============

1. Fork this repository
2. Run `npm install`
3. Write the behavior you expect in `spec-coffee/`
4. Edit files in `coffee/` until `grunt test` says you're done
5. Run `grunt` to update `priority-queue.js` and `priority-queue.min.js`
6. Submit a pull request

License
=======

I, Adam Hooper, the sole author of this project, waive all my rights to it and
release it under the [Public
Domain](http://creativecommons.org/publicdomain/zero/1.0/). Do with it what you
will.
