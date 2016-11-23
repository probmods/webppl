var fs = require('fs');
var assert = require('assert');
var Tensor = require('adnn/tensor');
var THREE = require('three');
var Sobel = require('./sobel.js');


// Wrapper for the 'new' operator that can be called in webppl code
function _new(ctor) {
	var args = Array.prototype.slice.call(arguments, 1);
	var obj = Object.create(ctor.prototype);
	ctor.apply(obj, args);
	return obj;
}

function getSobel(img) {
	var sobelImg = img.__sobel;
	if (img.__sobel === undefined) {
		img.__sobel = Sobel.sobel(img.toTensor(0, 1));
		sobelImg = img.__sobel;
	}
	return sobelImg;
}

// ----------------------------------------------------------------------------
// 2D image class


function ImageData2D() {}
ImageData2D.prototype = {
	constructor: ImageData2D,
	loadFromCanvas: function(canvas) {
		this.imgDataObj = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
		this.data = this.imgDataObj.data;
		this.width = canvas.width;
		this.height = canvas.height;
		return this;
	},
	copyToCanvas: function(canvas) {
		var ctx = canvas.getContext('2d');
		var imgDataObj = this.imgDataObj;
		if (imgDataObj === undefined) {
			imgDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
			var n = this.data.length;
			for (var i = 0; i < n; i++) {
				imgDataObj.data[i] = this.data[i];
			}
		}
		ctx.putImageData(imgDataObj, 0, 0);
	},
	fillWhite: function(w, h) {
		if (this.width != w || this.height != h) {
			this.width = w;
			this.height = h;
			this.data = new Uint8ClampedArray(w*h*4);
		}
		this.data.fill(255)
		return this;
	},
	numSameBinary: function(other) {
		// assert(this.width === other.width && this.height === other.height,
		// 	'numSameBinary: image dimensions do not match!');
 		if (this.width !== other.width || this.height !== other.height) {
 			assert(false, 'numSameBinary: image dimensions do not match (' +
 				this.width + 'x' + this.height + ' vs. ' + other.width + 'x' + other.height + ')');
 		}
		var sim = 0;
		var n = this.data.length | 0;
		for (var i = 0; i < n; i += 4) {  // stride of 4 for RGBA pixels
			var eq = (this.data[i] === 255) === (other.data[i] === 255);
			sim += eq;
		}
		return sim;
	},
	weightedPercentSameBinary: function (other, sobelImg, flatWeight) {
		assert(this.width === other.width && this.height === other.height
			&& this.width === sobelImg.dims[1] && this.height === sobelImg.dims[2],
			'weightedPercentSameBinary: image dimensions do not match!');
		var sim = 0;
		var n = this.data.length | 0;
		var sumWeights = 0;
		for (var i = 0; i < n; i += 4) {  // stride of 4 for RGBA pixels
			var thisEmpty = this.data[i] === 255;
			var otherEmpty = other.data[i] === 255;
			var eq = thisEmpty === otherEmpty;
			var w = otherEmpty ? 1 : flatWeight + (1-flatWeight)*sobelImg.data[i/4];
			sim += w*eq;
			sumWeights += w;
		}

		sim = sim/sumWeights;
		return sim;
	},
	percentSameBinary: function(other) {
		var sim = this.numSameBinary(other);
		return sim / (this.height*this.width);
	},
	numFilled: function() {
		var count = 0;
		var n = this.data.length | 0;
		for (var i = 0; i < n; i += 4) {
			count += (this.data[i] !== 255);
		}
		return count;
	},
	percentFilled: function() {
		var n = this.numFilled();
		return n / (this.height*this.width);
	},
	binaryBilateralSymmetryScore: function() {
		var dist = 0;
		var w = this.width | 0;
		var h = this.height | 0;
		var whalf = Math.floor(w / 2) | 0;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < whalf; x++) {
				var xmirr = w - 1 - x;
				var i = y*w + x;
				var imirr = y*w + xmirr;
				// Stride of 4 for RGBA
				// var d = Math.abs(this.data[4*i] - this.data[4*imirr]) / 255;
				var d = (this.data[4*i] === 255) !== (this.data[4*imirr] === 255);
				dist += d;
			}
		}
		return 1 - dist/(whalf*h);
	},
	binaryFilledBilateralSymmetryScore: function() {
		var dist = 0;
		var n = 0;
		var w = this.width;
		var h = this.height;
		var whalf = Math.floor(w / 2);
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < whalf; x++) {
				var xmirr = w - 1 - x;
				var i = y*w + x;
				var imirr = y*w + xmirr;
				// Stride of 4 for RGBA
				var v = this.data[4*i];
				var vmirr = this.data[4*imirr];
				if (v !== 255) {
					n++;
					dist += vmirr === 255;
				}
				if (vmirr !== 255) {
					n++;
					dist += v === 255;
				}
			}
		}
		return 1 - dist/n;
	},
	toBinaryByteArray: function() {
		var numPixels = this.width*this.height;
		var numBytes = Math.ceil(numPixels/8);
		var arr = [];
		for (var i = 0; i < numBytes; i++) {
			arr.push(0);
		}
		for (var i = 0; i < numPixels; i++) {
			var r = this.data[4*i];
			var g = this.data[4*i+1];
			var b = this.data[4*i+2];
			var bit = (r < 128 && g < 128 && b < 128);
			var byteIndex = Math.floor(i / 8);
			var byteRem = i % 8;
			arr[byteIndex] |= (bit << byteRem);
		}
		return new Uint8Array(arr);
	},
	fromBinaryByteArray: function(arr, w, h) {
		this.fillWhite(w, h);
		var numPixels = w*h;
		for (var i = 0; i < numPixels; i++) {
			var byteIndex = Math.floor(i / 8);
			var byteRem = i % 8;
			var bit = (arr[byteIndex] >> byteRem) & 1;
			var pixel = bit === 1 ? 0 : 255;
			this.data[4*i] = pixel;
			this.data[4*i+1] = pixel;
			this.data[4*i+2] = pixel;
			this.data[4*i+3] = 255;	// full alpha
		}
		return this;
	},
	// Converts [0, 255] to [lo, hi]
	toTensor: function(lo, hi) {
		if (lo === undefined) lo = -1;
		if (hi === undefined) hi = 1;
		var x = new Tensor([1, this.height, this.width]);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var r = this.data[4*i];
			var t = r / 255;
			x.data[i] = (1-t)*lo + t*hi;
		}
		return x;
	},
	// Converts [lo, hi] to [0, 255]
	fromTensor: function(x, lo, hi) {
		if (lo === undefined) lo = -1;
		if (hi === undefined) hi = 1;
		var range = hi - lo;
		var h = x.dims[1];
		var w = x.dims[2];
		this.fillWhite(w, h);
		var numPixels = this.width*this.height;
		for (var i = 0; i < numPixels; i++) {
			var t = (x.data[i] - lo) / range;
			var p = 255 * t;
			this.data[4*i] = p;
			this.data[4*i+1] = p;
			this.data[4*i+2] = p;
			this.data[4*i+3] = 255;	// full alpha
		}
		return this;
	},
	//// TEST /////
	gradNorm: function() {
		var gradImg = Sobel.sobel(this.toTensor(0, 1));
		var s = 0;
		var n = this.width*this.height;
		for (var i = 0; i < n; i++) {
			s += gradImg.data[i];
		}
		return s / n;
	}
};


// ----------------------------------------------------------------------------
// Similarity functions


// Similarity function between target image and another image
function binarySimilarity(img, targetImg) {
	return img.percentSameBinary(targetImg);
}

// Gradient (of target) weighted binary similarity
function makeGradientWeightedSimilarity(edgeMul) {
	var flatWeight = 1 / edgeMul;
	return function(img, targetImg) {
		var sobelTarget = getSobel(targetImg);
		return img.weightedPercentSameBinary(targetImg, sobelTarget, flatWeight);
	};
}

// Sobel similarity
function sobelSimilarity(img, targetImg) {
	var sobelTarget = getSobel(targetImg);
	var sobelImg = Sobel.sobel(img.toTensor());
	var numEntries = sobelImg.dims[1]*sobelImg.dims[2];

	var d = 0;
	for (var i = 0; i < numEntries; i++) {
		d += Math.abs(sobelImg.data[i] - sobelTarget.data[i]);
	}
	d /= numEntries;

	// Convert distance to similarity
	var sim = 1 - d;
	return sim;
}

// Linear combination of two similarity measures
function makeCombinedSimilarity(weight, sim1, sim2) {
	if (weight == 0) {
		return sim1;
	} else if (weight === 1) {
		return sim2;
	} else {
		return function(img, targetImg) {
			var s1 = sim1(img, targetImg);
			var s2 = sim2(img, targetImg);
			return (1 - weight)*s1 + weight*s2;
		};
	}
}

///////////////////////////
// Which similarity measure should we use?
// var similarity = binarySimilarity;
var similarity = makeGradientWeightedSimilarity(1.5);
// var similarity = sobelSimilarity;
// var similarity = binarizedSobelSimilarity;
// var similarity = makeCombinedSimilarity(0.5, binarySimilarity, sobelSimilarity);
///////////////////////////


// Baseline similarity of a blank image to a target image
function baselineSimilarity(targetImg) {
	var w = targetImg.width;
	var h = targetImg.height;
	var img = new ImageData2D().fillWhite(w, h);
	return similarity(img, targetImg);
}

// Similarity normalized against the baseline
// 'target' is a target object from the TargetImageDatabase
function normalizedSimilarity(img, target) {
	var sim = similarity(img, target.image);
	return (sim - target.baseline) / (1 - target.baseline);
}


// ----------------------------------------------------------------------------
// Render utilities actually exposed to the program during inference

var render = require('./render.js');

var rendering = {
	canvas: undefined,
	init: function(canvas) {
		this.canvas = canvas;
	},
	renderStart: function(geo, viewport) {
		render.renderCanvasProxy(this.canvas, viewport, geo);
	},
	renderIncr: function(geo, viewport) {
		render.renderCanvasProxy(this.canvas, viewport, geo, true, false);
	},
	drawImgToRenderContext: function(img) {
		img.copyToCanvas(this.canvas);
	},
	copyImgFromRenderContext: function() {
		return new ImageData2D().loadFromCanvas(this.canvas);
	}
};


// ----------------------------------------------------------------------------
// Bounds for various geometries

var bboxes = {
	branch: function(branch) {
		var bbox = new THREE.Box2();
		bbox.expandByPoint(branch.start);
		bbox.expandByPoint(branch.end);
		return bbox;
	},
	leaf: (function() {
		function pivot(p, sin, cos, c) {
			return new THREE.Vector2(
				cos*p.x + sin*p.y + c.x,
				sin*p.x - cos*p.y + c.y
			);
		}
		// Conservative:
		// Compute corners of object-space ellipse,
		//    transform them into world-space, then
		//    compute the BBox of those points.
		return function(leaf) {
			var w2 = leaf.width/2;
			var l2 = leaf.length/2;
			var p0 = new THREE.Vector2(-w2, -l2);
			var p1 = new THREE.Vector2(w2, -l2);
			var p2 = new THREE.Vector2(-w2, l2);
			var p3 = new THREE.Vector2(w2, l2);
			var sin = Math.sin(leaf.angle);
			var cos = Math.cos(leaf.angle);
			var center = leaf.center;
			p0 = pivot(p0, sin, cos, center);
			p1 = pivot(p0, sin, cos, center);
			p2 = pivot(p0, sin, cos, center);
			p3 = pivot(p0, sin, cos, center);
			var box = new THREE.Box2();
			box.expandByPoint(p0);
			box.expandByPoint(p1);
			box.expandByPoint(p2);
			box.expandByPoint(p3);
			return box;
		}
	})(),
	flower: function(flower) {
		var min = new THREE.Vector2(
			flower.center.x - flower.radius,
			flower.center.y - flower.radius
		);
		var max = new THREE.Vector2(
			flower.center.x + flower.radius,
			flower.center.y + flower.radius
		);
		return new THREE.Box2(min, max);
	}
};



// ----------------------------------------------------------------------------


module.exports = {
	new: _new,
	ImageData2D: ImageData2D,
	baselineSimilarity: baselineSimilarity,
	normalizedSimilarity: normalizedSimilarity,
	rendering: rendering,
	bboxes: bboxes
};






