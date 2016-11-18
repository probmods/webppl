var nn = require('adnn/nn');
var Tensor = require('adnn/tensor');

// Horizontal and vertical filters
var SOBEL_X_FILTER = [[[[-1, 0, 1],
                      [-2, 0, 2],
                      [-1, 0, 1]]]]; 

var SOBEL_Y_FILTER = [[[[1, 2, 1],
                      [0, 0, 0],
                      [-1, -2, -1]]]];  

var x_filter = new Tensor([1, 1, 3, 3]);
var y_filter = new Tensor([1, 1, 3, 3]);
var biases = new Tensor([1]);
x_filter.fromArray(SOBEL_X_FILTER);
y_filter.fromArray(SOBEL_Y_FILTER);
biases.fromArray([0]);

// Stride: 1
// Biases: none
// Pad: 1
function sobel(img) {
	var grad_x = nn.convolve(img, x_filter, biases, 1, 1, 1, 1);
	var grad_y = nn.convolve(img, y_filter, biases, 1, 1, 1, 1);

	// Compute magnitude
	var grad = new Tensor([grad_x.dims[0], grad_x.dims[1], grad_x.dims[2]]);

	var numEntries = grad_x.dims[1]*grad_x.dims[2];

	for (var i = 0; i < numEntries; i++) {
		grad.data[i] = Math.sqrt(grad_x.data[i]*grad_x.data[i] + grad_y.data[i]*grad_y.data[i]);
	}

	return grad;
}

module.exports = {
	sobel: sobel, 
};