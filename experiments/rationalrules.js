
var erp = require('../src/erp.js');


var genSynthData = function(nFeatures, nExamples, tau) {

	var getFormula = function() {
		if (erp.bernoulliERP.sample([tau])) {
			var c = conj();
			var f = getFormula();
			return function (x) { return c(x) || f(x); };
		} else
			return conj();
	};

	var conj = function() {
		if (erp.bernoulliERP.sample([tau])) {
			var p = pred();
			var c = conj();
			return function (x) { return p(x) && c(x); };
		} else
			return pred();
	};

	var pred = function() {
		var index = erp.randomIntegerERP.sample([nFeatures]);
		var value = erp.randomIntegerERP.sample([2]);
		return function (x) { return x[index] === value };
	};

	// Generate a formula
	var formula = getFormula();
	// Generate all possible bit vectors of length nFeatures
	var allPossible = [];
	function gen(bitvec) {
		if (bitvec.length === nFeatures)
			allPossible.push(bitvec);
		else {
			gen(bitvec.concat([0]));
			gen(bitvec.concat([1]));
		}
	}
	gen([]);
	// Randomly subsample nExamples from this list
	var examples = [];
	for (var i = 0; i < nExamples; i++) {
		var index = erp.randomIntegerERP.sample([allPossible.length]);
		examples.push(allPossible[index]);
		allPossible.splice(index, 1);
	}
	// Classify them into two sublists using the formula
	var as = [];
	var bs = [];
	for (var i = 0; i < examples.length; i++) {
		var x = examples[i];
		if (formula(x))
			as.push(x);
		else
			bs.push(x);
	}

	return {
		a: as,
		b: bs
	}
};


module.exports = {
	genSynthData: genSynthData
}