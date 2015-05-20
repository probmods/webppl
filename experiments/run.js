
var harness = require('./harness.js');


// We compare HashMH, CPS HashMH, and IncrementalMH
var infSettings = [
	{name: 'Lightweight_MH', code: 'HashMH(program, nIters, true);'},
	{name: 'Lightweight_MH_CPS', code: 'HashMH(program, nIters, false);'},
	{name: 'Incremental_MH', code: 'IncrementalMH(program, nIters);', doCaching: true},
	{name: 'Incremental_MH_noAdapt', code: 'IncrementalMH(program, nIters, true);', doCaching: true}
];


// HMM --------------------------------

var config = {
	file: 'hmm.wppl',
	params: {
		// Defaults
		nObservations: 200,
		nIters: 10000
	},
	// doCaching: true,
	// inference: 'IncrementalMH(program, nIters);',
	// // inference: 'IncrementalMH(program, nIters, true);'
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
// 	// // inference: 'IncrementalMH(program, nIters, true);',
// };

// // harness.time(config, function(args) { console.log(args[0]); });

// // Vary nDocs
// harness.csv('results/lda_nDocs.csv', ['infMethod', 'nDocs', 'time'], config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nDocs', harness.range(5, 50, 5, 10),
// 			harness.time)));