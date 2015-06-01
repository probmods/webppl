
var erp = require('../src/erp.js');

function genSynthData(xstart, xincr, n, N) {
	var x = [];
	var xi = xstart;
	var xbar = 0;
	for (var i = 0; i < n; i++) {
		xbar += xi;
		x.push(xi);
		xi += xincr;
	}
	xbar /= n;
	var ys = [];
	// var alphac = erp.gaussianERP.sample([0, 1e4]);
	// var betac = erp.gaussianERP.sample([0, 1e4]);
	// var tauc = erp.gammaERP.sample([1e-3, 1e3]);
	// var taualpha = erp.gammaERP.sample([1e-3, 1e3]);
	// var taubeta = erp.gammaERP.sample([1e-3, 1e3]);
	var alphac = erp.gaussianERP.sample([0, 1e2]);
	var betac = erp.gaussianERP.sample([0, 1e2]);
	var tauc = erp.gammaERP.sample([1e-1, 1e1]);
	var taualpha = erp.gammaERP.sample([1e-1, 1e1]);
	var taubeta = erp.gammaERP.sample([1e-1, 1e1]);
	for (var i = 0; i < N; i++) {
		var y = [];
		var alpha = erp.gaussianERP.sample([alphac, 1/taualpha]);
		var beta = erp.gaussianERP.sample([betac, 1/taubeta]);
		for (var j = 0; j < n; j++) {
			var mu = alpha + beta * (x[j] - xbar);
			y.push(erp.gaussianERP.sample([mu, tauc]));
		}
		ys.push(y);
	}
	return {
		x: x,
		xbar: xbar,
		ys: ys
	};
};


module.exports = {
	genSynthData: genSynthData
};


