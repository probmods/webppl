// This really should be post-CPS header code in a webppl package (or part of webppl core?)
// As a quick-n-dirty workaround, I'm just having this in its own module, and then I globally
//    install the exported functions later.

function makeFuture(s, k, a, fn) {
	// Create the global futures list, if it does not exist
	if (s.__futures === undefined)
		s.__futures = [];
	// The future just calls the original function with the address
	//    from its creation point.
	var future = function(s, k) {
		return fn(s, k, a);
	}
	future.depth = a.split('_').length;
	// Append this future to the global list
	s.__futures = s.__futures.concat([future]);
	return k(s);
}

function makeFinishAllFutures(selectionFn) {
	function finishAllFutures(s, k, a) {
		if (s.__futures !== undefined && s.__futures.length > 0) {
			return selectionFn(s, function(s, fut) {
				var i = s.__futures.indexOf(fut);
				s.__futures = s.__futures.slice();
				s.__futures.splice(i, 1);
				return fut(s, function(s) {
					return finishAllFutures(s, k, a.concat('_f0'));
				});
			}, a.concat('_f1'));
		} else return k(s);
	}
	return finishAllFutures;
}

var policies = {
	// Immediate policy: Just run the future immediately.
	immediate: {
		future: function(s, k, a, fn) {
			return fn(s, k, a);
		},
		finishAllFutures: function(s, k) {
			return k(s);
		}
	},
	// LIFO policy: Store futures in a list, and pull
	//    futures off of that list in LIFO order.
	// (This is similar to the immediate policy, except that it
	//    traverses children last-to-first instead of first-to-last)
	lifo: {
		future: makeFuture,
		finishAllFutures: makeFinishAllFutures(function(s, k, a) {
			return k(s, s.__futures[s.__futures.length - 1]);
		})
	},
	// FIFO policy: Store futures in a list, and pull
	//    futures off of that list in FIFO order.
	fifo: {
		future: makeFuture,
		finishAllFutures: makeFinishAllFutures(function(s, k, a) {
			return k(s, s.__futures[0]);
		})
	},
	// Uniform-from-all policy: Store futures in a list, and pull
	//    futures out of that list in random order.
	uniformFromAll: {
		future: makeFuture,
		finishAllFutures: makeFinishAllFutures(function(s, k, a) {
			return sample(s, function(s, i) {
				return k(s, s.__futures[i]);
			}, a.concat('_f2'), randomIntegerERP, [s.__futures.length]);
		})
	},
	// Uniform-from-deepest policy: Select futures in random order, but only
	//    choose from those futures with the longest address.
	// (This is somewhat sensitive to how the program is written, i.e. `superfluous'
	//    mutual recursion might make something look longer than it really should be)
	uniformFromDeepest: {
		future: makeFuture,
		finishAllFutures: makeFinishAllFutures(function(s, k, a) {
			var maxDepth = 0;
			for (var i = 0; i < s.__futures.length; i++) {
				maxDepth = Math.max(s.__futures[i].depth, maxDepth);
			}
			var deepest = s.__futures.filter(function(f) { return f.depth === maxDepth; });
			return sample(s, function(s, i) {
				return k(s, deepest[i]);
			}, a.concat('_f3'), randomIntegerERP, [deepest.length]);
		})
	},
	// Depth-weighted policy: select randomly from all futures with probability
	//    proportional to address length
	depthWeighted: {
		future: makeFuture,
		finishAllFutures: makeFinishAllFutures(function(s, k, a) {
			var minDepth = Infinity;
			for (var i = 0; i < s.__futures.length; i++) {
				minDepth = Math.min(minDepth, s.__futures[i].depth);
			}
			var unnormProbs = s.__futures.map(function(f) {
				var normDepth = f.depth - minDepth + 1;
				// return normDepth;
				// return normDepth*normDepth;
				// return Math.pow(2, normDepth);
				return Math.exp(normDepth);
			});
			// console.log(unnormProbs);
			return sample(s, function(s, i) {
				return k(s, s.__futures[i]);
			}, a.concat('_f4'), discreteERP, unnormProbs);
		})
	}
}

// Switch what type of future is being used
function setFuturePolicy(s, k, a, policyname) {
	if (!policies.hasOwnProperty(policyname)) {
		throw new Error('no future policy named ' + policyname)
	}
	s.__futurePolicy = policies[policyname];
	return k(s);
}

// We default to the immediate policy
function ensurePolicy(s) {
	if (s.__futurePolicy === undefined) {
		s.__futurePolicy = policies.immediate;
	}
}

function future(s, k, a, fn) {
	ensurePolicy(s);
	return s.__futurePolicy.future(s, k, a, fn);
}

function finishAllFutures(s, k, a) {
	ensurePolicy(s);
	return s.__futurePolicy.finishAllFutures(s, k, a);
}


module.exports = {
	setFuturePolicy: setFuturePolicy,
	future: future,
	finishAllFutures: finishAllFutures
};

