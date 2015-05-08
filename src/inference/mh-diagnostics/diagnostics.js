var util = require('../../util.js');
var PythonShell = require('python-shell');
var fs = require('fs');

// Geweke convergence test
function geweke(traces, first, last, intervals) {
  var first = typeof first !== 'undefined' ? first : 0.1;
  var last = typeof last !== 'undefined' ? last : 0.5;
  var intervals = typeof intervals !== 'undefined' ? intervals : 20;
  if (first + last >= 1.0) {
    throw 'Error: Intervals should sum to less than 1.0.';
  }
  var zscores = [];
  var end = traces.length;
  for (var i = 0; i < traces.length / 2; i = i + Math.floor((traces.length / 2) / (intervals - 1))) {
    var firstSlice = traces.slice(i, i + Math.floor(first * (end - i)));
    var lastSlice = traces.slice(Math.floor(end - last * (end - i)), traces.length);
    var mu = (util.mean(firstSlice) - util.mean(lastSlice));
    var zscore = mu / Math.sqrt(Math.pow(util.std(firstSlice), 2) + Math.pow(util.std(lastSlice), 2));
    zscores.push([i, zscore]);
  }
  return zscores;
}

function run(traces) {
  //var scores = geweke(traces);
  //console.log('Geweke Zscores:');
  //for (var i = 0; i < scores.length; i++) {
  //  console.log(scores[i]);
  //}

  var scriptPath = './src/inference/mh-diagnostics';

  PythonShell.defaultOptions = {
    scriptPath: scriptPath,
    mode: 'text'
  };

  fs.writeFile(scriptPath + '/temp/trace.json', JSON.stringify(traces), function(err) {
    if (err) {
      return console.log(err);
    }
    var pyshell = new PythonShell('graph.py');

    pyshell.on('message', function(message) {
      console.log(message);
    }).end(function(err) {
      if (err) throw err;
      console.log('Finished running diagnostics');
    });
  });
}

module.exports = {
  run: run
};
