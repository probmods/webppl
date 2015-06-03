
var harness = require('./harness.js');
var fs = require('fs');


var infSettings = [
	{name: 'Lightweight_MH', code: 'HashMH(program, nIters, {doFullRerun: true});'},
	// {name: 'Lightweight_MH_CPS', code: 'HashMH(program, nIters);'},
	{name: 'Incremental_MH', code: 'IncrementalMH(program, nIters);', doCaching: true},
	// {name: 'Incremental_MH_noAdapt', code: 'IncrementalMH(program, nIters, {dontAdapt: true});', doCaching: true},
	// {name: 'Incremental_MH_noCPS', code: 'IncrementalMH(program, nIters, {dontAdapt: true, doFullRerun: true});', doCaching: true}
];

var nReps = 10;

var header = ['infMethod', 'modelSize', 'time'];



// // HMM w/ discrete states --------------------------------

// var config = {
// 	file: 'hmm-discrete.wppl',
// 	requires: [{name: 'hmm', path: 'hmm-discrete.js'}],
// 	params: {
// 		// Defaults
// 		nObservations: 100,
// 		nLatentStates: 10,
// 		nObsStates: 10,
// 		nIters: 1000
// 	},
// };

// harness.csv('results/bench/hmm.csv', header, config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nObservations', harness.range(100, 1000, 100, nReps),
// 			harness.time,
// 		function (nObs) { return nObs/100; })));


// // LDA --------------------------------

// var lda_config = {
// 	file: 'lda.wppl',
// 	requires: [{name: 'lda', path: 'lda.js'}],
// 	params: {
// 		// defaults
// 		nTopics: 10,
// 		nDocs: 50,
// 		nWords: 100,
// 		nWordsPerDoc: 20,
// 		nIters: 1000
// 	},
// };

// harness.csv('results/bench/lda.csv', header, lda_config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nDocs', harness.range(5, 50, 5, nReps),
// 			harness.time,
// 		function (nDocs) { return nDocs/5; })));


// // GMM --------------------------------

// var gmm_config = {
// 	file: 'gmm.wppl',
// 	requires: [{name: 'gmm', path: 'gmm.js'}],
// 	params: {
// 		// Defaults
// 		nComponents: 4,
// 		nDataPoints: 500,
// 		nIters: 1000
// 	},
// 	// doCaching: true,
// 	// inference: 'IncrementalMH(program, nIters, {lag: 1, debuglevel: 0, dontAdapt: false});',
// 	// inference: 'HashMH(program, nIters, {doFullRerun: true});',
// };

// // harness.time(gmm_config, function(args) { console.log(args[0]); });

// harness.csv('results/bench/gmm.csv', header, gmm_config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nDataPoints', harness.range(100, 1000, 100, nReps),
// 			harness.time,
// 		function (nPoints) { return nPoints/100; })));


// // Hierarchical Linear Regression --------------------------------

// var hlr_config = {
// 	file: 'hierlinreg.wppl',
// 	requires: [{name: 'hlr', path: 'hierlinreg.js'}],
// 	params: {
// 		nIters: 1000,
// 		xStart: 8,
// 		xIncr: 7,
// 		datumSize: 5,
// 		numData: 100
// 	},
// 	catchExceptions: true,
// 	// doCaching: true,
// 	// inference: 'IncrementalMH(program, nIters, {lag: 1, debuglevel: 0, dontAdapt: false});',
// 	// inference: 'HashMH(program, nIters, {doFullRerun: true});',
// };

// // harness.time(hlr_config, function(args) { console.log(args[0]); });

// harness.csv('results/bench/hlr.csv', header, hlr_config,
// 	harness.infCompare(infSettings,
// 		harness.varying('numData', harness.range(20, 200, 20, nReps),
// 			harness.time,
// 		function (nData) { return nData/20; })));


// Rational Rules --------------------------------

var rr_config = {
	// file: 'rationalrules.wppl',
	// requires: [{name: 'rr', path: 'rationalrules.js'}],
	file: 'rationalrules-dtree.wppl',
	requires: [{name: 'rr', path: 'rationalrules.js'}],
	params: {
		nIters: 200,
		nFeatures: 20,
		nExamples: 1,
		tau: 0.75,
		// nClauses: 100,
		// clauseSize: 10,
		depth: 20,
		sleepAmt: 20
	},
	// doCaching: true,
	// inference: 'IncrementalMH(program, nIters, {lag: 1, debuglevel: 0, dontAdapt: false, verbose: true});',
	inference: 'HashMH(program, nIters, {doFullRerun: true, verbose: true});',
};

harness.time(rr_config, function(args) { console.log(args[0]); });





