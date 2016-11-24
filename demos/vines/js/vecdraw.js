var THREE = require('three');

function VecDraw(canvas, sketchCanvas, options) {
	this.canvas = canvas;
	this.canvasjq = $(canvas);
	this.context = canvas.getContext('2d');
	this.sketchCanvasjq = $(sketchCanvas);
	this.length = options.length;
	this.width = options.width;
	this.callback = options.callback;
	this.canvasjq.bind('click mousedown mouseup mousemove mouseleave mouseout touchstart touchmove touchend touchcancel', this.onEvent.bind(this));
	this.canvasjq.bind('contextmenu', this.onContextMenu.bind(this));
};

var RIGHT_BUTTON = 3;

// Suppress right-click context menu
VecDraw.prototype.onContextMenu = function(e) {
	return false;
};

VecDraw.prototype.computeStartPosAndDir = function(sx, sy, ex, ey) {
	var relStartX = sx / this.canvas.width;
	var relStartY = sy / this.canvas.height;
	var relEndX = ex / this.canvas.width;
	var relEndY = ey / this.canvas.height;
	var startPos = new THREE.Vector2(relStartX, relStartY);
	var endPos = new THREE.Vector2(relEndX, relEndY);
	var startDir = endPos.clone().sub(startPos).normalize();
	return [startPos, startDir];
};

VecDraw.prototype.onEvent = function(e) {
	if (e.originalEvent && e.originalEvent.targetTouches) {
		e.pageX = e.originalEvent.targetTouches[0].pageX;
		e.pageY = e.originalEvent.targetTouches[0].pageY;
	}
	e.preventDefault();

	var x = e.pageX - this.canvasjq.offset().left;
	var y = e.pageY - this.canvasjq.offset().top;

	// Start drawing
	if ((e.type === 'mousedown' || e.type === 'touchstart') && e.which === RIGHT_BUTTON) {
		this.drawing = true;
		this.x = x;
		this.y = y;
	}

 	// Draw: compute normalized start / end pos, visualize it
	if (this.drawing) {
		var spd = this.computeStartPosAndDir(this.x, this.y, x, y);
		var startPos = spd[0];
		var startDir = spd[1];
		this.draw(startPos, startDir);
	}

	// Stop drawing: compute normalized start / end pos, invoke callback
	if (this.drawing && (e.type === 'mouseup' || e.type === 'mouseleave' || e.type === 'mouseout' ||
		e.type === 'touchend' || e.type === 'touchcancel')) {
		this.drawing = false;
		var spd = this.computeStartPosAndDir(this.x, this.y, x, y);
		var startPos = spd[0];
		var startDir = spd[1];
		this.callback(startPos, startDir);
	}

	// Forward events on to the underlying sketch canvas
	this.sketchCanvasjq.trigger(e);

	return false;
};

// pos, dir are normalized to canvas size
VecDraw.prototype.draw = function(pos, dir) {
	this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
	var startPos = new THREE.Vector2(pos.x * this.canvas.width, pos.y * this.canvas.height);
	var endPos = startPos.clone().add(dir.clone().multiplyScalar(this.length));
	this.context.lineJoin = "round";
	this.context.lineCap = "round";
	this.context.beginPath();
	this.context.moveTo(startPos.x, startPos.y);
	this.context.lineTo(endPos.x, endPos.y);
	this.context.strokeStyle = 'red';
	this.context.lineWidth = this.width;
	this.context.stroke();
};

module.exports = VecDraw;


