
var harness = require('./harness.js');


// We compare HashMH, CPS HashMH, and IncrementalMH
var infSettings = [
	{name: 'Lightweight_MH', code: 'HashMH(program, nIters, {doFullRerun: true});'},
	{name: 'Lightweight_MH_CPS', code: 'HashMH(program, nIters);'},
	{name: 'Incremental_MH', code: 'IncrementalMH(program, nIters);', doCaching: true},
	{name: 'Incremental_MH_noAdapt', code: 'IncrementalMH(program, nIters, {dontAdapt: true});', doCaching: true}
];


// // HMM --------------------------------

// var config = {
// 	file: 'hmm.wppl',
// 	params: {
// 		// Defaults
// 		nObservations: 200,
// 		nIters: 10000
// 	},
// 	// doCaching: true,
// 	// inference: 'IncrementalMH(program, nIters);',
// };

// // harness.time(config, function(args) { console.log(args[0]) });

// // Vary nObservations
// harness.csv('results/hmm_nObservations.csv', ['infMethod', 'nObservations', 'time'], config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nObservations', harness.range(10, 200, 10, 10),
// 			harness.time)));


// HMM w/ discrete states --------------------------------

var config = {
	file: 'hmm-discrete.wppl',
	requires: [{name: 'hmm', path: 'hmm-discrete.js'}],
	params: {
		// Defaults
		nObservations: 200,
		nLatentStates: 10,
		nObsStates: 10,
		nIters: 10000
	},
	// doCaching: true,
	// inference: 'IncrementalMH(program, nIters);',
};

// harness.time(config, function(args) { console.log(args[0]) });

// Vary nObservations
harness.csv('results/hmm_nObservations.csv', ['infMethod', 'nObservations', 'time'], config,
	harness.infCompare(infSettings,
		harness.varying('nObservations', harness.range(10, 200, 10, 10),
			harness.time)));


// // LDA --------------------------------

// var config = {
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
// 	// doCaching: true,
// 	// inference: 'IncrementalMH(program, nIters);',
// };

// // harness.time(config, function(args) { console.log(args[0]); });

// // Vary nDocs
// harness.csv('results/lda_nDocs.csv', ['infMethod', 'nDocs', 'time'], config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nDocs', harness.range(5, 50, 5, 10),
// 			harness.time)));