// Require some stuff here
var fs = require('fs')
var THREE = require('three')

// This is the 'app state' that the webppl program is aware of
// (The undefined fields get filled in later)
var appState = {
	startPos = undefined,
	startDir = undefined
};

// Initialize the start pos, start dir for the initial target image
var coordfile = fs.readFileSync(__dirname + '/../assets/initialTarget.txt', 'utf8');
var coordlines = coordfile.split('\n');
var coords = coordlines[0].split(' ');
var dir = coordlines[1].split(' ');
appState.startPos = new THREE.Vector2(parseFloat(coords[0]), parseFloat(coords[1]));
appState.startDir = new THREE.Vector2(parseFloat(dir[0]), parseFloat(dir[1]));

// Load the wppl source code
var wpplCode = fs.readFileSync(__dirname + '/../wppl/vines_targetImage.wppl');

// This will hold the compiled webppl function that is ready to go
var prepared = undefined;

function compile() {

}

function generate() {
	// Compile code, if that hasn't been done yet
	if (prepared === undefined) {
		compile();
	}
	// Downsample the target image from the sketch canvas, store it in the smaller canvas
	// Run program!
}

$(window).load(function(){
	// Put the initial target image into the sketch canvas
	var sketchCanvas = $('#sketchInput')[0];
	var ctx = sketchCanvas.getContext("2d");
	var image = $('#initialTarget')[0];
	ctx.drawImage(image, 0, 0);

	// Set up event listener for generation
	$('#generate').click(generate);
});