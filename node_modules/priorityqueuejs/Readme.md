# priorityqueue.js

A simple priority queue data structure for Node.js and the browser.

## Installation

As component for the browser:

```
$ component install janogonzalez/priorityqueuejs
```

As npm for Node.js:

```
$ npm install priorityqueuejs
```

## Example

```js
var PriorityQueue = require('priorityqueuejs');

var queue = new PriorityQueue(function(a, b) {
  return a.cash - b.cash;
});

queue.enq({ cash: 250, name: 'Valentina' });
queue.enq({ cash: 300, name: 'Jano' });
queue.enq({ cash: 150, name: 'Fran' );
queue.size(); // 3
queue.peek(); // { cash: 300, name: 'Jano' }
queue.deq(); // { cash: 300, name: 'Jano' }
queue.size(); // 2
```

## API

### PriorityQueue()

Initializes a new empty `PriorityQueue` wich uses `.DEFAULT_COMPARATOR()` as
the comparator function for its elements.

### PriorityQueue(comparator)

Initializes a new empty `PriorityQueue` with uses the given `comparator(a, b)`
function as the comparator for its elements.

The comparator function must return a positive number when `a > b`, 0 when
`a == b` and a negative number when `a < b`.

### PriorityQueue.DEFAULT_COMPARATOR(a, b)

Compares two `Number` or `String` objects.

### PriorityQueue#deq()

Dequeues the top element of the priority queue.
Throws an `Error` when the queue is empty.

### PriorityQueue#enq(element)

Enqueues the `element` at the priority queue and returns its new size.

### PriorityQueue#forEach(fn)

Executes `fn` on each element. Just be careful to not modify the priorities,
since the queue won't reorder itself.

### PriorityQueue#isEmpty()

Returns whether the priority queue is empty or not.

### PriorityQueue#peek()

Peeks at the top element of the priority queue.
Throws an `Error` when the queue is empty.

### PriorityQueue#size()

Returns the size of the priority queue.

## Testing

As component in the browser, open test/test.html in your browser:

```
$ make
$ open test/test.html
```

As npm package:

```
$ npm test
```

## Licence

MIT
