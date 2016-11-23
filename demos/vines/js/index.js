// Require some stuff here
var assert = require('assert');
var fs = require('fs');
var THREE = require('three');
var utils = require('./utils');
var render = require('./render');
var futures = require('./futures');

// Globally install modules that webppl code needs
window.THREE = THREE;
window.utils = utils;
// Globally install the futures functions (hack to make them work like WebPPL header code)
for (var prop in futures) {
	window[prop] = futures[prop];
}

// App state
var target = {
	image: undefined,
	baseline: undefined,
	tensor: undefined,
	startPos: undefined,
	startDir: undefined,
};
window.target = target;
var targetNeedsRefresh = true;


// Initialize the start pos, start dir for the initial target image
var coordfile = fs.readFileSync(__dirname + '/../assets/initialTarget.txt', 'utf8');
var coordlines = coordfile.split('\n');
var coords = coordlines[0].split(' ');
var dir = coordlines[1].split(' ');
target.startPos = new THREE.Vector2(parseFloat(coords[0]), parseFloat(coords[1]));
target.startDir = new THREE.Vector2(parseFloat(dir[0]), parseFloat(dir[1]));


// Load the wppl source code
// TODO: also load vinesLeafFlower version.
var wpplCode = fs.readFileSync(__dirname + '/../wppl/vines_targetImage.wppl');


// Prepare target for inference (downsample image, compute baseline, etc.)
function prepareTarget() {
	if (targetNeedsRefresh) {
		// Downsample sketch image
		var sketchCanvas = $('#sketchInput')[0];
		var targetImage = $('#loResTarget')[0];
		var ctx = targetImage.getContext('2d');
		ctx.drawImage(sketchCanvas,
			0, 0, sketchCanvas.width, sketchCanvas.height,
			0, 0, targetImage.width, targetImage.height);
		target.image = new utils.ImageData2D().loadFromCanvas(targetImage);

		// Compute new baseline
		target.baseline = utils.baselineSimilarity(target.image);

		// Compute tensor version of image
		target.tensor = target.image.toTensor();

		targetNeedsRefresh = false;
	}
}


// This will hold the compiled webppl function that is ready to go
var prepared = undefined;

function compile() {
	assert(typeof(webppl) !== 'undefined', 'webppl is not loaded!')
	var compiled = webppl.compile(wpplCode);
	prepared = webppl.prepare(compiled, function(s, retval) {
		console.log('done');
		// Draw to result canvas
		var canvas = $('#resultsDisplay')[0];
		var viewport = retval.viewport;
		var geo = retval.samp;
		render.renderCanvasProxy(canvas, viewport, geo, false, true);
	});
}

function generate() {
	// Compile code, if that hasn't been done yet
	if (prepared === undefined) {
		compile();
	}

	// Downsample the target image from the sketch canvas, etc.
	prepareTarget();

	// Run program!
	prepared.run();
}

$(window).load(function(){
	// Put the initial target image into the sketch canvas
	var sketchCanvas = $('#sketchInput')[0];
	var ctx = sketchCanvas.getContext("2d");
	var image = $('#initialTarget')[0];
	ctx.drawImage(image, 0, 0);

	// Register which canvas the rendering system should use during inference
	utils.rendering.init($('#loResResult')[0]);

	// Set up event listener for generation
	$('#generate').click(generate);

	// Test
	prepareTarget();
});

