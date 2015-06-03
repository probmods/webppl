
var erp = require('../src/erp.js');

// We memoize the results of generating all possible bit vectors, since this can
//    get time consuming to compute over and over again.
var bvcache = {};
function allBitVectors(length) {
	var result = bvcache[length];
	if (result === undefined) {
		result = [];
		function gen(bitvec) {
			if (bitvec.length === length)
				result.push(bitvec);
			else {
				gen(bitvec.concat([0]));
				gen(bitvec.concat([1]));
			}
		}
		gen([]);
		bvcache[length] = result;
	}
	return result;
}

function genSynthDataFromFormula(nFeatures, nExamples, formula) {
	// Generate all possible bit vectors of length nFeatures
	var allPossible = allBitVectors(nFeatures);
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
}

function genFormulaGrammar(tau) {
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
	return getFormula();
}

function genSynthData_grammar(nFeatures, nExamples, tau) {
	var formula = genFormulaGrammar(tau);
	return genSynthDataFromFormula(nFeatures, nExamples, formula);
}

function genFormulaSystematic(nFeatures, nClauses, clauseSize) {
	var getFormula = function(n) {
		if (n > 1) {
			var c = conj(clauseSize);
			var f = getFormula(n - 1);
			return function (x) { return c(x) || f(x); };
		} else
			return conj(clauseSize);
	};

	var conj = function(n) {
		if (n > 1) {
			var p = pred();
			var c = conj(n - 1);
			return function (x) { return p(x) && c(x); };
		} else
			return pred();
	};

	var pred = function() {
		var index = erp.randomIntegerERP.sample([nFeatures]);
		var value = erp.randomIntegerERP.sample([2]);
		return function (x) { return x[index] === value };
	};
	return getFormula(nClauses);
}

function genSynthData_systematic(nFeatures, nExamples, nClauses, clauseSize) {
	var formula = genFormulaSystematic(nFeatures, nClauses, clauseSize);
	return genSynthDataFromFormula(nFeatures, nExamples, formula);
}

function genFormulaDtree(nFeatures, depth) {
	if (depth > nFeatures) throw "depth > nFeatures";
	var getFormula = function(freeindices, depth) {
		if (depth > 0) {
			var i = erp.randomIntegerERP.sample([freeindices.length]);
			var index = freeindices[i];
			var newfreeindices = freeindices.slice(0, i).concat(freeindices.slice(i+1));
			var truebranch = getFormula(newfreeindices, depth-1);
			var falsebranch = getFormula(newfreeindices, depth-1);
			return function (x) { return (x[index] === 1) ? truebranch(x) : falsebranch(x); }
		} else {
			var boolliteral = erp.bernoulliERP.sample([0.5]);
			return function (x) { return boolliteral; }
		}
	}
	var freeindices = [];
	for (var i = 0; i < nFeatures; i++) freeindices.push(i);
	return getFormula(freeindices, depth);
}

function genSynthData_dtree(nFeatures, nExamples, depth) {
	var formula = genFormulaDtree(nFeatures, depth);
	return genSynthDataFromFormula(nFeatures, nExamples, formula);
}

function sleep(time) {
    var stop = new Date().getTime();
    while(new Date().getTime() < stop + time) {}
}

module.exports = {
	sleep: sleep,
	// genSynthData: genSynthData_grammar
	// genSynthData: genSynthData_systematic
	genSynthData: genSynthData_dtree
}



