'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var _ = require('underscore');

// Download and gunzip training set from:
// http://yann.lecun.com/exdb/mnist/

// JSON output written to current directory.

if (process.argv.length < 3) {
  console.log('Usage: node mnist path_to_mnist_dataset');
  process.exit();
}

var baseDir = process.argv[2];

var trainImagesFilename = 'train-images-idx3-ubyte';
var trainLabelsFilename = 'train-labels-idx1-ubyte';

var loadImages = function(fn) {
  var buff = fs.readFileSync(fn);

  assert.strictEqual(buff.readUInt32BE(0), 2051);
  assert.strictEqual(buff.readUInt32BE(4), 60000);
  assert.strictEqual(buff.readUInt32BE(8), 28);
  assert.strictEqual(buff.readUInt32BE(12), 28);

  var offset = 16;
  var images = [];

  for (var i = 0; i < 60000; i++) {
    var image = [];
    for (var j = 0; j < 784; j++) {
      var pixelIntensity = buff[offset + (i * 784) + j];
      // Make binary.
      image.push(pixelIntensity < 128 ? 0 : 1);
    }
    images.push(image);
  }

  return images;
};

var loadLabels = function(fn) {
  var buff = fs.readFileSync(fn);

  assert.strictEqual(buff.readUInt32BE(0), 2049);
  assert.strictEqual(buff.readUInt32BE(4), 60000);

  var offset = 8;
  var labels = [];

  for (var i = 0; i < 60000; i++) {
    labels.push(buff[offset + i]);
  }

  return labels;
};

var showImage = function(image) {
  for (var k = 0; k < 28; k++) {
    console.log(image.slice(k * 28, (k + 1) * 28)
                .join('')
                .replace(/0/g, ' ')
                .replace(/1/g, '*'));
  }
};

var images = loadImages(path.join(baseDir, trainImagesFilename));
fs.writeFileSync('mnist_images.json', JSON.stringify(images));

var labels = loadLabels(path.join(baseDir, trainLabelsFilename));
fs.writeFileSync('mnist_labels.json', JSON.stringify(labels));
