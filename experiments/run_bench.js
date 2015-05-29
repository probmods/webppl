
var harness = require('./harness.js');


var infSettings = [
	{name: 'Lightweight_MH', code: 'HashMH(program, nIters, {doFullRerun: true});'},
	{name: 'Lightweight_MH_CPS', code: 'HashMH(program, nIters);'},
	{name: 'Incremental_MH', code: 'IncrementalMH(program, nIters);', doCaching: true},
	{name: 'Incremental_MH_noAdapt', code: 'IncrementalMH(program, nIters, {dontAdapt: true});', doCaching: true},
	{name: 'Incremental_MH_noCPS', code: 'IncrementalMH(program, nIters, {dontAdapt: true, doFullRerun: true});', doCaching: true}
];

var nReps = 10;


// GMM --------------------------------

var gmm_config = {
	file: 'gmm.wppl',
	requires: [{name: 'gmm', path: 'gmm.js'}],
	params: {
		// Defaults
		nComponents: 3,
		nDataPoints: 500,
		nIters: 1000
	},
	// doCaching: true,
	// inference: 'IncrementalMH(program, nIters, {lag: 1, debuglevel: 0, dontAdapt: false});',
	// inference: 'HashMH(program, nIters, {doFullRerun: true});',
};

// harness.time(gmm_config, function(args) { console.log(args[0]); });

harness.csv('results/gmm.csv', ['infMethod', 'time'], gmm_config,
	harness.infCompare(infSettings, nReps,
			harness.time));