// Require some stuff here
var assert = require('assert');
var fs = require('fs');
var THREE = require('three');
var utils = require('./utils');
var render = require('./render');
var nnarch = require('./nnarch');

// Globally install modules that webppl code needs
window.THREE = THREE;
window.utils = utils;

// Load the guide neural net architecture
nnarch.addArch('pyramid_linearfilters_targetAndGen', require('./nnarch/architectures/pyramid_linearfilters_targetAndGen'));

// --------------------------------------------------------------------------------------

// App state
window.target = undefined;
window.nnGuide = undefined;
var whichProgram = 'vines';
var possibleTargets = ['A', 'D', 'G', 'H', 'I', 'P', 'R', 'S'];

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
	vines: {
		codeFile: 'wppl/vines.wppl',
		paramsFile: 'params/vines.json',
		render: renderVines
	},
	lightning: {
		codeFile: 'wppl/lightning.wppl',
		paramsFile: 'params/lightning.json',
		render: renderLightning
	}
};

function loadTextFile(filename, callback) {
	$.ajax({
		async: true,
		dataType: 'text',
	    url: filename,
	    success: function (data) {
	        callback(data);
	    }
	});
}

function loadImage(filename, callback) {
	var img = new Image;
	img.addEventListener('load', function() {
		callback(img);
	});
	img.src = filename;
}

function compile(program, callback) {
	// Return right away if program is already compiled
	if (program.prepared) {
		callback();
	} else {
		// Load code file, compile it
		loadTextFile(program.codeFile, function(code) {
			assert(typeof(webppl) !== 'undefined', 'webppl is not loaded!')
			var compiled = webppl.compile(code);
			program.prepared = webppl.prepare(compiled, function(s, retval) {
				// Draw to result canvas
				program.render(retval.samp, retval.viewport);
			});
			// Load params file
			loadTextFile(program.paramsFile, function(paramsJSON) {
				program.nnarch = nnarch.loadFromJSON(paramsJSON);
				// Return
				callback();
			});
		});
	}
}

function generate() {
	// Check if program needs compiling, then run it
	var program = programs[whichProgram];
	compile(program, function() {
		// Make the program's guide networks globally available
		window.nnGuide = program.nnarch;
		program.prepared.run();
	});
}

var targetCache = {};
function getTarget(name, callback) {
	var target = targetCache[name];
	if (target == undefined) {
		// Load target image and starting pos/dir
		loadImage('assets/targets/' + name + '.png', function(img) {
			loadTextFile('assets/targets/' + name + '.txt', function(coordfile) {
				var target = { img: img };
				// Compute lo-res image data
				var loResTarget = $('#loResTarget')[0];
				var ctx = loResTarget.getContext('2d');
				ctx.drawImage(img,
					0, 0, img.width, img.height,
					0, 0, loResTarget.width, loResTarget.height);
				target.image = new utils.ImageData2D().loadFromCanvas(loResTarget);
				// Compute baseline
				target.baseline = utils.baselineSimilarity(target.image);
				// Compute tensor version of image
				target.tensor = target.image.toTensor();
				// Compute starging position/direction
				var coordlines = coordfile.split('\n');
				var coords = coordlines[0].split(' ');
				var dir = coordlines[1].split(' ');
				target.startPos = new THREE.Vector2(parseFloat(coords[0]), parseFloat(coords[1]));
				target.startDir = new THREE.Vector2(parseFloat(dir[0]), parseFloat(dir[1]));

				targetCache[name] = target;
				callback(target);
			});
		});
	} else  {
		callback(target);
	}
}
function setTarget(name, callback) {
	getTarget(name, function(target) {
		// Render the target image to the preview canvas
		var hiResTarget = $('#hiResTarget')[0];
		var ctx = hiResTarget.getContext('2d');
		ctx.drawImage(target.img,
			0, 0, target.img.width, target.img.height,
			0, 0, hiResTarget.width, hiResTarget.height);
		// Make the target oject globally available (for webppl programs)
		window.target = target;
		callback();
	});
}

// --------------------------------------------------------------------------------------

// Initialization logic
$(window).load(function(){

	// Load up all the rendering assets
	var gl = $('#glCanvas')[0].getContext('webgl');
	render.loadAssets(gl, function() {
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

	    // Register which canvas the rendering system should use during inference
		utils.rendering.init($('#loResResult')[0]);


		// Load up some target to start with
		setTarget('G', function() {});
	});
});

