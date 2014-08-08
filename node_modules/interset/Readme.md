# interset

[![Build Status](https://secure.travis-ci.org/Gozala/interset.png)](http://travis-ci.org/Gozala/interset)

[![Browser support](http://ci.testling.com/Gozala/interset.png)](http://ci.testling.com/Gozala/interset)

Binary operations for logical sets in our case arrays, although in a future
support for upcoming sets maybe added.

## API

#### union

Return a set that is the [union][] of the input sets.

![union](http://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Venn0111.svg/200px-Venn0111.svg.png)


```js
var union = require("interset/union")

union()
// => []

union([1, 2])
// => [1, 2]

union([1, 2], [2, 3])
// => [1, 2, 3]

union([1, 2], [2, 3], [3, 4])
// => [1, 2, 3, 4]
```

#### intersection

Return a set that is the [intersection][] of the input sets.

![intersection](http://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Venn0001.svg/200px-Venn0001.svg.png)

```js
intersection()
// => TypeError: intersection requires at least one argument

intersection([1])
// => [1]

intersection([1, 2], [2, 3])
// => [2]

intersection([1, 2], [2, 3], [3, 4])
// => []

intersection([1, "a"], ["a", 3], ["a"])
// => ["a"]
```

#### difference

Return a set that is the first set without elements of the remaining sets

![difference](http://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Venn0010.svg/200px-Venn0010.svg.png)

```js
var difference = require("interset/difference")

difference()
// => TypeError: difference requires at least one arguments

difference([1, 2, 3])
// => [1, 2, 3]

difference([1, 2], [2, 3])
// => [1]

difference([1, 2, 3], [1], [1, 4], [3])
// => [2]
```

## Install

    npm install interset

[union]:http://en.wikipedia.org/wiki/Union_%28set_theory%29
[intersection]:http://en.wikipedia.org/wiki/Intersection_%28set_theory%29
[difference]:http://en.wikipedia.org/wiki/Set_difference#Relative_complement
