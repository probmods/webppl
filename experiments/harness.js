
var _ = require('underscore');
var fs = require('fs');
var util = require('util');
var webppl = require('../src/main.js');


function hrtimeToSeconds(t) {
	// Seconds + nanoseconds
	return t[0] + t[1]/1e9;
}

// Inclusive
function makeRange(start, end, incr, reps) {
	reps = reps || 1;
	var arr = [];
	for (var i = start; i <= end; i += incr)
		for (var j = 0; j < reps; j++)
			arr.push(i);
	return arr;
}


// Time a run of a program
// config is:
//   - code: webppl code containing a main function called 'program'
//   - file: File to load code from, if 'code' is undefined.
//   - requires: list of {name:, path: } for any external js modules needed
//        (can be undefined).
//   - params: object containing name->value mapping of constant params
//        to be inserted at the head of the file
//   - inference: string of code to be inserted at the end of the file which
//        calls an inference routine
//   - doCaching: whether the incrementalization transform should be enabled
// calls 'callback' on the time returned
function time(config, callback) {
	var code = config.code || fs.readFileSync(config.file);

	var paramPrefix = '';
	if (config.params !== undefined) {
		for (var param in config.params) {
			paramPrefix += util.format('var %s = %s;\n',
										param,
										JSON.stringify(config.params[param]));
		}
	}

	code = paramPrefix + code + '\n' + config.inference + '\n';

	// Set up requires
	if (config.requires !== undefined) {
		var prevreqs = {};
		for (var i = 0; i < config.requires.length; i++) {
			var r = config.requires[i];
			prevreqs[r.name] = global[r.name];
			global[r.name] = require(r.path);
		}
	}

	// Compile code and turn it into executable function
	var compiledCode = webppl.compile(code, false, config.doCaching);
	var progfn = eval(compiledCode);

	// Run with top continuation that times it.
	var t0;
	function topK() {
		var tdiff = process.hrtime(t0);
		// Restore requires before 'returning'
		for (var name in prevreqs)
			global[name] = prevreqs[name];
		if (callback !== undefined)
			callback([hrtimeToSeconds(tdiff)]);
	}

	// Wrap in a loop that tries this until it succeeds, in case the
	//    progfn throws an exception
	function go() {
		var success = true;
		try {
			t0 = process.hrtime();
			progfn({}, topK, '');
		} catch (e) {
			success = false;
		} finally {
			return success;
		}
	}
	do {
		var success = go();
	} while(!success);

	// t0 = process.hrtime();
	// progfn({}, topK, '');
}


// Run something multiple times, varying the value of some parameter
// Invoke 'callback' on each return value
function varying(varyingName, varyingValues, config, callback, fn) {
	var origparams = config.params;
	for (var i = 0; i < varyingValues.length; i++) {
		var value = varyingValues[i];
		config.params = _.clone(config.params);
		config.params[varyingName] = value;
		fn(config, function(args) {
			callback([value].concat(args));
		});
	}
	config.params = origparams;
}
function makeVarying(varyingName, varyingValues, fn) {
	return function(config, callback) {
		varying(varyingName, varyingValues, config, callback, fn);
	}
}

// Run something over different inference methods
// infSettings is a list of {name:, code: } objects
function infCompare(infSettings, reps, config, callback, fn) {
	var originf = config.inference;
	var origdocache = config.doCaching;
	for (var i = 0; i < infSettings.length; i++) {
		config.inference = infSettings[i].code;
		config.doCaching = infSettings[i].doCaching;
		var infname = infSettings[i].name;
		for (var j = 0; j < reps; j++) {
			fn(config, function(args) {
				callback([infname].concat(args));
			});
		}
	}
	config.inference = originf;
	config.doCaching = origdocache;
}
function makeInfCompare(infSettings, reps, fn) {
	return function(config, callback) {
		infCompare(infSettings, reps, config, callback, fn);
	}
}


// Run something and save the results to a CSV file
function csv(file, headerLabels, config, fn) {
	var f = fs.openSync(file, 'w');
	fs.writeSync(f, headerLabels.toString() + '\n');
	fn(config, function(args) {
		var row = args.map(function(x) { return x.toString(); });
		fs.writeSync(f, row.toString() + '\n');
	})
	fs.closeSync(f);
}


module.exports = {
	range: makeRange,
	time: time,
	varying: makeVarying,
	infCompare: makeInfCompare,
	csv: csv
};
