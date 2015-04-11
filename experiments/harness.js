
var _ = require('underscore');
var fs = require('fs');
var util = require('util');
var webppl = require('../src/main.js');


function hrtimeToSeconds(t) {
	// Seconds + nanoseconds
	return t[0] + t[1]/1e9;
}


function argslice(args) {
	return Array.prototype.slice.call(args);
}


// Inclusive
function makeRange(start, end, incr) {
	var arr = [];
	for (var i = start; i <= end; i += incr)
		arr.push(i);
	return arr;
}


// Time a run of a program
// config is:
//   - code: webppl code containing a main function called 'program'
//   - file: File to load code from, if 'code' is undefined.
//   - requires: list of {name:, path: } for any external js modules needed
//   - params: object containing name->value mapping of constant params
//        to be inserted at the head of the file
//   - inference: {name:, args: } object for the inference method
// calls 'callback' on the time returned
function time(config, callback) {
	var code = config.code || fs.readFileSync(config.file);

	// Parameter prefix
	var paramPrefix = '';
	if (config.params !== undefined) {
		for (var param in config.params) {
			paramPrefix += util.format('var %s = %s;\n',
										param,
										JSON.stringify(config.params[param]));
		}
	}

	// Inference suffix
	var infSuffix = util.format('%s(program, %s);\n',
								config.inference.name,
								// slice to remove array brackets
								JSON.stringify(config.inference.args).slice(1, -1));

	code = paramPrefix + code + infSuffix;

	// Compile code and turn it into executable function
	var progfn = eval(webppl.compile(code));

	// Run with top continuation that times it.
	var t0 = process.hrtime();
	function topK() {
		var tdiff = process.hrtime(t0);
		callback(hrtimeToSeconds(tdiff));
	}
	progfn({}, topK, '');
}


// Run something multiple times, varying the value of some parameter
// Invoke 'callback' on each return value
function varying(varyingName, varyingValues, config, callback, fn) {
	var origparams = config.params;
	for (var i = 0; i < varyingValues.length; i++) {
		var value = varyingValues[i];
		config.params = _.clone(config.params);
		config.params[varyingName] = value;
		fn(config, function() {
			callback([value].concat(argslice(arguments)));
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
function infCompare(infSettings, config, callback, fn) {
	var originf = config.inference;
	for (var i = 0; i < infSettings.length; i++) {
		config.inference = infSettings[i];
		var infname = config.inference.name + JSON.stringify(config.inference.args);
		fn(config, function() {
			callback([infname].concat(argslice(arguments)));
		})
	}
	config.inference = originf;
}
function makeInfCompare(infSettings, fn) {
	return function(config, callback) {
		infCompare(infSettings, config, callback, fn);
	}
}


// Run something and save the results to a CSV file
function csv(file, headerLabels, config, fn) {
	var f = fs.openSync(file, 'w');
	fs.writeSync(f, headerLabels.toString() + '\n');
	fn(config, function() {
		var row = argslice(args).map(function(x) { return JSON.stringify(x); });
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
