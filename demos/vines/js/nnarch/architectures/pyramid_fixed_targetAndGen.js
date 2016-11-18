var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');
var Tensor = require('adnn/tensor');

var archname = __filename.split('/').pop().slice(0, -3);


// Predict ERP params as a function of the local pixel window of the target image
//    around the current position. Do this at multiple scales.

// Apply same procedure to image so far, feed into MLP. 


var nPyramidLevels = 4;

// This network is not parameterized, so we don't need to register it
//    with nnFunction.
var downsampleNet = nn.meanpool({filterSize: 2});


function normalize(x, lo, hi) {
	return (x - lo) / (hi - lo);
}


module.exports = NNArch.subclass(require('./localFeatures'), archname, {

	constructTargetPyramid: function(inputImageTensor) {
		var pyramid = [inputImageTensor];
		for (var i = 0; i < nPyramidLevels-1; i++) {
			var prev = pyramid[i];
			var next = downsampleNet.eval(prev);
			pyramid.push(next);
		}
		return pyramid;
	},

	constructImageSoFarPyramid: function(globalStore) {
		globalStore.imageSoFarPyramid = [globalStore.genImg.toTensor()]; 
		for (var i = 0; i < nPyramidLevels-1; i++) {
			var prev = globalStore.imageSoFarPyramid[i];
			var next = downsampleNet.eval(prev);
			globalStore.imageSoFarPyramid.push(next);
		}
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
		// Construct image so far pyramid 
		this.constructImageSoFarPyramid(globalStore);
		// Doubling due to adding features for image so far
		this.nTotalFeatures = 2*9*nPyramidLevels + this.nLocalFeatures; 
	},

	step: function(globalStore, localState) {
		// Construct image so far pyramid 
		this.constructImageSoFarPyramid(globalStore);
	},

	paramPredictMLP: NNArch.nnFunction(function(name, nOut) {
		return nn.mlp(this.nTotalFeatures, [
			{nOut: Math.floor(this.nTotalFeatures/2), activation: nn.tanh},
			{nOut: nOut}
		], name);
	}),

	predict: function(globalStore, localState, name, paramBounds) {
		// Extract pixel neighborhood at each pyramid level, concat into
		//    one vector (along with local features)
		var features = new Tensor([this.nTotalFeatures]);
		var v = this.constants.viewport;
		var x = normalize(localState.pos.x, v.xmin, v.xmax);
		var y = normalize(localState.pos.y, v.ymin, v.ymax);
		var fidx = 0;
		for (var i = 0; i < nPyramidLevels; i++) {
			var targetImg = globalStore.pyramid[i];

			//Image so far
			var imgSoFar = globalStore.imageSoFarPyramid[i];
			var imgsize = targetImg.dims[1];	// dim 0 is channel depth (= 1)
			var cx = Math.floor(x*imgsize);
			var cy = Math.floor(y*imgsize);
			for (var wy = cy - 1; wy <= cy + 1; wy++) {
				for (var wx = cx - 1; wx <= cx + 1; wx++) {
					var imgidx = wy*imgsize + wx;
					var inbounds = wx >= 0 && wx < imgsize && wy >= 0 && wy < imgsize;
					features.data[fidx] = inbounds ? targetImg.data[imgidx] : 0;
					fidx++;
					

					//Adding image so far to features
					features.data[fidx] = inbounds ? imgSoFar.data[imgidx] : 0;
					fidx++;				
				}
			}
		}
		for (var i = 0; i < this.nLocalFeatures; i++, fidx++) {
			features.data[fidx] = localState.features.data[i];
		}

		// Feed features into MLP
		var nOut = paramBounds.length;
		var y = this.paramPredictMLP(name, nOut).eval(features);
		return this.splitAndBoundParams(y, paramBounds);
	}

});





