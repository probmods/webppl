var erp = require('../src/erp.js')

function genSynthModel(nLatentStates, nObsStates) {
	// Generate transition model
	var transPrior = [];
	for (var i = 0; i < nLatentStates; i++) transPrior.push(1);
	var transModel = [];
	for (var i = 0; i < nLatentStates; i++) {
		transModel.push(erp.dirichletERP.sample(transPrior));
	}
	// Generate observation model
	var obsPrior = [];
	for (var i = 0; i < nObsStates; i++) obsPrior.push(1);
	var obsModel = [];
	for (var i = 0; i < nLatentStates; i++) {
		obsModel.push(erp.dirichletERP.sample(obsPrior));
	}
	return {
		transition: transModel,
		observation: obsModel
	};
}

function genSynthData(nObservations, nObsStates) {
	var data = [];
	for (var i = 0; i < nObservations; i++) {
		data.push(erp.randomIntegerERP.sample([nObsStates]));
	}
	return data;
}

module.exports = {
	genSynthModel: genSynthModel,
	genSynthData: genSynthData
};