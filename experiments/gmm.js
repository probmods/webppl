
var erp = require('../src/erp.js');

function genSynthData(nComps, nData) {
	var params = [];
	for (var i = 0; i < nComps; i++)
		params.push({
			mu: erp.gaussianERP.sample([0, 10]),
			sigma: erp.uniformERP.sample([0, 5])
		});
	var data = [];
	for (var i = 0; i < nData; i++) {
		var compi = erp.randomIntegerERP.sample([nComps]);
		var p = params[compi];
		data.push(erp.gaussianERP.sample([p.mu, p.sigma]));
	}
	return data;
}

module.exports = {
	genSynthData: genSynthData
};