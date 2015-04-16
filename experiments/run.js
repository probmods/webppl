
var harness = require('./harness.js');


// We compare HashMH, CPS HashMH, and IncrementalMH
var infSettings = [
	{name: 'Lightweight_MH', code: 'HashMH(program, nIters, true);'},
	{name: 'Lightweight_MH_CPS', code: 'HashMH(program, nIters, false);'},
	{name: 'Incremental_MH', code: 'IncrementalMH(program, nIters);'}
];


// HMM --------------------------------

var config = {
	file: 'hmm.wppl',
	params: {
		// Defaults
		nObservations: 10,
		nIters: 10000
	}
};

// Vary nObservations
harness.csv('hmm_nObservations.csv', ['infMethod', 'nObservations', 'time'], config,
	harness.infCompare(infSettings,
		harness.varying('nObservations', harness.range(5, 200, 5),
			harness.time)));


// // LDA --------------------------------

// var config = {
// 	file: 'lda.wppl',
// 	requires: ['lda.js'],
// 	params: {
// 		// defaults
// 		nTopics: 10,
// 		nDocs: 20,
// 		nWords: 100,
// 		nWordsPerDoc: 50
// 		nIters: 1000
// 	}
// };

// // Vary nDocs
// harness.csv('lda_nDocs.csv', ['infMethod', 'nDocs', 'time'], config,
// 	harness.infCompare(infSettings,
// 		harness.varying('nDocs', harness.range(5, 50, 5),
// 			harness.time)));