var NNArch = require('../nnarch.js');
var Tensor = require('adnn/tensor');

var archname = __filename.split('/').pop().slice(0, -3);


var fuzz = [0, 1e-8];
function normalize(x, lo, hi) {
	// Fuzz prevents values from normalizing to exactly zero (causing zero
	//    derivatives)
	return (2 * (x - lo) / (hi - lo)) - 1 + gaussianERP.sample(fuzz);
};

var TWOPI = 2*Math.PI;
function normang(theta) {
	if (theta >= 0) {
		return theta - (TWOPI*Math.floor(theta / TWOPI));
	} else {
		return theta - (TWOPI*Math.ceil(theta / TWOPI)) + TWOPI;
	}
};



module.exports = NNArch.subclass(NNArch, archname, {

	localFeatures: function(localState) {
		var viewport = this.constants.viewport;
		var minWidth = this.constants.minWidth;
		var initialWidth = this.constants.initialWidth;
		return new Tensor([4]).fromFlatArray([
			normalize(localState.pos.x, viewport.xmin, viewport.xmax),
			normalize(localState.pos.y, viewport.ymin, viewport.ymax),
			normalize(localState.width, minWidth, initialWidth),
			normalize(normang(localState.angle), 0, 2*Math.PI)
		]);
	},
	
	nLocalFeatures: 4,

});