// Require some stuff here
var assert = require('assert');
var fs = require('fs');
var THREE = require('three');
var utils = require('./utils');
var render = require('./render');
var Sketch = require('./sketch');
var VecDraw = require('./vecdraw');
var futures = require('./futures');

// Globally install modules that webppl code needs
window.THREE = THREE;
window.utils = utils;
// Globally install the futures functions (hack to make them work like WebPPL header code)
for (var prop in futures) {
	window[prop] = futures[prop];
}

// --------------------------------------------------------------------------------------

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
var whichProgram = 'vines';


// Initialize the start pos, start dir for the initial target image
var coordfile = fs.readFileSync(__dirname + '/../assets/initialTarget.txt', 'utf8');
var coordlines = coordfile.split('\n');
var coords = coordlines[0].split(' ');
var dir = coordlines[1].split(' ');
var origStartPos = new THREE.Vector2(parseFloat(coords[0]), parseFloat(coords[1]));
var origStartDir = new THREE.Vector2(parseFloat(dir[0]), parseFloat(dir[1]));
target.startPos = origStartPos;
target.startDir = origStartDir;

// --------------------------------------------------------------------------------------

function renderCanvasProxy(geo, viewport) {
	var canvas = $('#resultsDisplay')[0];
	render.renderCanvasProxy(canvas, viewport, geo, false, true);
}

function compositeGLPixelsToCanvas(canvas, gl) {
	// Read back pixels
	var pixelData = new Uint8Array(canvas.width*canvas.height*4);
	gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
	// (Doing this pixel-by-pixel on CPU, b/c there doesn't appear to be 
	//    a generally-supported better alternative as of yet)
	var ctx = canvas.getContext('2d');
	var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var data = imgData.data;
	var n = data.length / 4;
	for (var i = 0; i < n; i++) {
		var ri = 4*i;
		var gi = 4*i+1;
		var bi = 4*i+2;

		var alpha = pixelData[4*i+3]/255;
		data[ri] = Math.floor((1-alpha)*data[ri] + alpha*pixelData[ri]);
		data[gi] = Math.floor((1-alpha)*data[gi] + alpha*pixelData[gi]);
		data[bi] = Math.floor((1-alpha)*data[bi] + alpha*pixelData[bi]);
	}
	ctx.putImageData(imgData, 0, 0);
}

function renderSetup(gl) {
	gl.clearColor(0, 0, 0, 0);
	gl.depthFunc(gl.LEQUAL); 
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable (gl.BLEND);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

function renderVines(geo, viewport) {
	// Fill background
	var canvas = $('#resultsDisplay')[0];
	var ctx = canvas.getContext('2d');
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'white';
	ctx.fill();
	// Do GL rendering
	var gl = $('#glCanvas')[0].getContext('webgl');
	renderSetup(gl);
	render.renderGLDetailed(gl, viewport, geo);
	// Composite pixels back to display canvas
	compositeGLPixelsToCanvas(canvas, gl);
}

function renderLightning(geo, viewport) {
	// Fill background
	var canvas = $('#resultsDisplay')[0];
	var ctx = canvas.getContext('2d');
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'black';
	// Do GL rendering
	ctx.fill();
	var gl = $('#glCanvas')[0].getContext('webgl');
	renderSetup(gl);
	render.renderGLLightning(gl, viewport, geo);
	// Composite pixels back to display canvas
	compositeGLPixelsToCanvas(canvas, gl);
}

// --------------------------------------------------------------------------------------

// Statically load the webppl source code
var programs = {
	lightning: {
		file: 'wppl/lightning.wppl',
		render: renderLightning
	},
	vines: {
		file: 'wppl/vines.wppl',
		render: renderVines
	}
};

function loadCodeFile(filename, callback) {
	$.ajax({
		async: true,
		dataType: 'text',
	    url: filename,
	    success: function (data) {
	        callback(data);
	    }
	});
}

function compile(program, callback) {
	assert(typeof(webppl) !== 'undefined', 'webppl is not loaded!')
	loadCodeFile(program.file, function(code) {
		var compiled = webppl.compile(code);
		program.prepared = webppl.prepare(compiled, function(s, retval) {
			// Draw to result canvas
			program.render(retval.samp, retval.viewport);
		});
		callback();
	});
}

function run() {
	programs[whichProgram].prepared.run();
}

function generate() {
	// Downsample the target image from the sketch canvas, etc.
	prepareTarget();

	// Compile code, if that hasn't been done yet
	var program = programs[whichProgram];
	if (program.prepared === undefined) {
		compile(program, run);
	} else {
		run();
	}
}

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

// --------------------------------------------------------------------------------------

// Initialization logic
$(window).load(function(){

	// Register which canvas the rendering system should use during inference
	utils.rendering.init($('#loResResult')[0]);

	// Set up event listener for generation
	$('#generate').click(generate);

	// Set up event listener for changing which program to run
	$('input:radio[name="whichProgram"]').change(
	    function(){
	        if (this.checked) {
	        	whichProgram = this.value;
	    	}
    	}
    );

    // Put the initial target image into the sketch canvas
	var sketchCanvas = $('#sketchInput')[0];
	var vecdraw;
	function resetTarget() {
		var ctx = sketchCanvas.getContext("2d");
		var image = $('#initialTarget')[0];
		ctx.drawImage(image, 0, 0);
		target.startPos = origStartPos;
		target.startDir = origStartDir;
		vecdraw.draw(origStartPos, origStartDir);
		targetNeedsRefresh = true;
	}

	// Wire up the sketch canvas
	var sketch = new Sketch(sketchCanvas, {
		size: 20,
		callback: function() { targetNeedsRefresh = true; }
	});

	// Wire up the vector drawing canvas
	var vecCanvas = $('#vectorInput')[0];
	vecdraw = new VecDraw(vecCanvas, sketchCanvas, {
		length: 30,
		width: 5,
		callback: function(startPos, startDir) {
			// console.log(startPos, startDir);
			target.startPos = startPos;
			target.startDir = startDir;
		}
	});

	// Clearing / restoring defaults
	$('#clearTargetShape').click(function() {
		sketch.clear();
		targetNeedsRefresh = true;
	});
	$('#resetTarget').click(function() {
		sketch.clear();
		resetTarget();
	});

	resetTarget();

	// Load all the rendering assets
	var gl = $('#glCanvas')[0].getContext('webgl');
	render.loadAssets(gl, function() {});
});

