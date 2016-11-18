var ad = require('adnn/ad');
var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');

var archname = __filename.split('/').pop().slice(0, -3);



var nPyramidLevels = 4;
var filterSize = 3;
var nInputLayers = 1;
var nHiddenLayers = 9;
var nOutputLayers = 1;
var activation = nn.tanh;
// var activation = nn.relu;


function normalize(x, lo, hi) {
	return (x - lo) / (hi - lo);
}


module.exports = NNArch.subclass(require('./localFeatures'), archname, {

	filter: NNArch.nnFunction(function(name) {
		return nn.sequence([
			nn.convolution({filterSize: filterSize, inDepth: nInputLayers, outDepth: nHiddenLayers}, name + '_conv'),
			activation,
			nn.layerwiseLinear(nHiddenLayers, nOutputLayers, name + '_fc')
		]);
	}),

	downsampleAndFilter: NNArch.nnFunction(function(name) {
		return nn.sequence([
			nn.convolution({filterSize: 2, inDepth: nOutputLayers, outDepth: nOutputLayers, stride: 2, pad: 0}, name +'_down'),
			activation,
			nn.convolution({filterSize: filterSize, inDepth: nInputLayers, outDepth: nHiddenLayers}, name + '_conv'),
			activation,
			nn.layerwiseLinear(nHiddenLayers, nOutputLayers, name + '_fc')
		]);
	}),

	constructTargetPyramid: function(inputImageTensor) {
		var pyramid = [ this.filter('level0').eval(inputImageTensor) ];
		for (var i = 0; i < nPyramidLevels-1; i++) {
			var prev = pyramid[i];
			var next = this.downsampleAndFilter('level'+(i+1)).eval(prev);
			pyramid.push(next);
		}
		return pyramid;
	},

	init: function(globalStore) {
		// Construct target pyramid
		if (this.training) {
			globalStore.pyramid = this.constructTargetPyramid(globalStore.target.tensor);
		} else {
			if (globalStore.target.pyramid === undefined) {
				globalStore.target.pyramid = this.constructTargetPyramid(globalStore.target.tensor);
			}
			globalStore.pyramid = globalStore.target.pyramid;
		}
		this.nTotalFeatures = 9*nPyramidLevels*nOutputLayers + this.nLocalFeatures;
	},

	paramPredictMLP: NNArch.nnFunction(function(name, nOut) {
		return nn.mlp(this.nTotalFeatures, [
			{nOut: Math.floor(this.nTotalFeatures/2), activation: nn.tanh},
			{nOut: nOut}
		], name);
	}),

	outOfBounds: NNArch.nnFunction(function(name) {
		return nn.constantparams([nPyramidLevels, nOutputLayers], name);
	}),

	predict: function(globalStore, localState, name, paramBounds) {
		// Extract pixel neighborhood at each pyramid level, concat into
		//    one vector (along with local features)
		var outOfBoundsVals = ad.tensorToScalars(this.outOfBounds('outOfBounds').eval());
		var features = new Array(this.nTotalFeatures);
		var v = this.constants.viewport;
		var x = normalize(localState.pos.x, v.xmin, v.xmax);
		var y = normalize(localState.pos.y, v.ymin, v.ymax);
		var fidx = 0;
		for (var i = 0; i < nPyramidLevels; i++) {
			var img = globalStore.pyramid[i];
			var imgsize = ad.value(img).dims[1];	// dim 0 is channel depth (i.e. nOutputLayers)
			var cx = Math.floor(x*imgsize);
			var cy = Math.floor(y*imgsize);
			for (var j = 0; j < nOutputLayers; j++) {
				var outOfBounds = outOfBoundsVals[i*nOutputLayers + j];
				for (var wy = cy - 1; wy <= cy + 1; wy++) {
					for (var wx = cx - 1; wx <= cx + 1; wx++) {
						var imgidx = wx + imgsize*(wy + imgsize*j);
						var inbounds = wx >= 0 && wx < imgsize && wy >= 0 && wy < imgsize;
						features[fidx] = inbounds ? ad.tensorEntry(img, imgidx) : outOfBounds;
						fidx++;
					}
				}
			}
		}
		
		for (var i = 0; i < this.nLocalFeatures; i++, fidx++) {
			features[fidx] = localState.features.data[i];
		}
		features = ad.scalarsToTensor(features);

		// Feed features into MLP
		var nOut = paramBounds.length;
		var y = this.paramPredictMLP(name, nOut).eval(features);
		return this.splitAndBoundParams(y, paramBounds);
	}

});




