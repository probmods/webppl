
var harness = require('./harness.js');


// We compare HashMH against IncrementalMH
var infSettings = [
	{name: 'HashMH', args: ['nIters']},
	{name: 'IncrementalMH', args: ['nIters']}
];


// LDA --------------------------------

var config = {
	file: 'lda.wppl',
	requires: ['lda.js'],
	params: {
		// defaults
		nTopics: 10,
		nDocs: 20,
		nWords: 100,
		nWordsPerDoc: 50
		nIters: 1000
	}
};

// Vary nDocs
harness.csv('lda_nDocs.csv', ['infMethod', 'nDocs', 'time'], config,
	harness.infCompare(infSettings,
		harness.varying('nDocs', harness.range(5, 50, 5),
			harness.time)));

// Vary nIters
harness.csv('lda_nIters.csv', ['infMethod', 'nIters', 'time'], config,
	harness.infCompare(infSettings,
		harness.varying('nIters', harness.range(100, 1000, 100),
			harness.time)));