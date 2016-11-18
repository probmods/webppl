var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');

var archname = __filename.split('/').pop().slice(0, -3);

// Really simple architecture where we predict ERP params using a multi-layer
//    perceptron of just the local features
module.exports = NNArch.subclass(require('./localFeatures'), archname, {

	paramPredictMLP: NNArch.nnFunction(function(name, nOut) {
		return nn.mlp(this.nLocalFeatures, [
			{nOut: 10, activation: nn.tanh},
			{nOut: nOut}
		], name);
	}),

	predict: function(globalStore, localState, name, paramBounds) {
		var nOut = paramBounds.length;
		var x = localState.features;
		var y = this.paramPredictMLP(name, nOut).eval(x);
		return this.splitAndBoundParams(y, paramBounds);
	}

});