
function Sketch(canvas, options) {
	this.canvas = canvas;
	this.canvasjq = $(canvas);
	this.context = canvas.getContext('2d');
	this.size = options.size;
	this.drawCallback = options.drawCallback;
	this.canvasjq.bind('click mousedown mouseup mousemove mouseleave mouseout touchstart touchmove touchend touchcancel', this.onEvent.bind(this));
};

Sketch.prototype.onEvent = function(e) {
	if (e.originalEvent && e.originalEvent.targetTouches) {
		e.pageX = e.originalEvent.targetTouches[0].pageX;
		e.pageY = e.originalEvent.targetTouches[0].pageY;
	}
	e.preventDefault();

	var x = e.pageX - this.canvasjq.offset().left;
	var y = e.pageY - this.canvasjq.offset().top;

	// Start drawing
	if (e.type === 'mousedown' || e.type === 'touchstart') {
		this.drawing = true;
		this.x = x;
		this.y = y;
	}

	// Drawing
	if (this.drawing) {
		// Begin path
		this.context.lineJoin = "round";
		this.context.lineCap = "round";
		this.context.beginPath();

		// Draw
		this.context.moveTo(this.x, this.y);
		this.context.lineTo(x, y);
		this.x = x; this.y = y;

		// End path
		this.context.strokeStyle = 'black';
		this.context.lineWidth = this.size;
		this.context.stroke();

		this.drawCallback();
	}

	// Stop drawing
	if (e.type === 'mouseup' || e.type === 'mouseleave' || e.type === 'mouseout' ||
		e.type === 'touchend' || e.type === 'touchcancel') {
		this.drawing = false;
	}

	return false;
};

Sketch.prototype.clear = function() {
	this.context.fillStyle = 'white';
	this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
};

module.exports = Sketch;


