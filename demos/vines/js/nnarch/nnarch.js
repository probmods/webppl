var assert = require('assert');
var fs = require('fs');
var _ = require('underscore');
var ad = require('adnn/ad');
var nn = require('adnn/nn');



// Base class for all neural net architectures
// All subclasses will live in ./architectures

function NNArch() {
	this.constants = {};
	this.nnCache = {};
	training: false
};


// Public interface -----------------------------------------------------------


// The client program can register constants, which may be useful for e.g.
//    computing local features
NNArch.prototype.constant = function(name, val) {
	this.constants[name] = val;
};

// Computation done once at the beginning of program execution
// By default, do nothing
NNArch.prototype.init = function(globalStore) {};

// Computation done after new geometry has been added
// By default, do nothing
NNArch.prototype.step = function(globalStore, localState) {};

// Compute local features from a local state object
// By default, do nothing
NNArch.prototype.localFeatures = function(localState) {};
// The number of local features (subclasses will need to know this when
//    building neural nets)
NNArch.prototype.nLocalFeatures = 0;

// Computation done to predict ERP params
NNArch.prototype.predict = function(globalStore, localState, name, paramBounds) {
	assert(false, 'predict must be implemented!');
};

// Set whether we're in training or test
NNArch.prototype.setTraining = function(flag) {
	this.training = flag;
	for (var name in this.nnCache) {
		var net = this.nnCache[name];
		net.setTraining(flag);
	}
}


// Save/load/retrieve interface -----------------------------------------------

NNArch.getArchByName = function(name) {
	return require('./architectures/' + name + '.js');
}

// Serialization / deserialization
NNArch.prototype.serializeJSON = function() {
	return {
		name: this.name,
		nnCache: _.mapObject(this.nnCache, function(net) {
			return net.serializeJSON();
		})
	};
};
NNArch.deserializeJSON = function(json) {
	var ctor = NNArch.getArchByName(json.name);
	var archObj = new ctor();
	archObj.nnCache = _.mapObject(json.nnCache, function(jn) {
		return nn.deserializeJSON(jn);
	});
	return archObj;
};

// File loading / saving
NNArch.prototype.saveToFile = function(filename) {
	fs.writeFileSync(filename, JSON.stringify(this.serializeJSON()));
};
NNArch.loadFromFile = function(filename) {
	return NNArch.deserializeJSON(JSON.parse(fs.readFileSync(filename).toString()));
};


// Private interface (for subclasses only) ------------------------------------


// Create new architecture subclass
NNArch.subclass = function(parent, name, properties) {
	var ctor = function() {
		parent.call(this);
		this.name = name;
	};
	ctor.prototype = Object.create(parent.prototype);
	for (var prop in properties) {
		ctor.prototype[prop] = properties[prop];
	}
	return ctor;
};


// Split a parameter tensor into scalars, then apply bounding transforms
// Helper function for all concrete implementations of 'predict'
NNArch.prototype.splitAndBoundParams = function(params, bounds) {
	var sparams = ad.tensorToScalars(params);
	for (var i = 0; i < sparams.length; i++) {
		var sp = sparams[i];
		sparams[i] = (bounds[i] ? bounds[i](sp) : sp);
	}
	return sparams;
};

// Wrapper around function that creates neural nets.
// The first argument to the function must be a name for the net.
//    (if undefined, the name is assumed to be the function name)
// The function is memoized on this first argument.
NNArch.nnFunction = function(fn) {
	return function() {
		var name = arguments[0];
		var net = this.nnCache[name];
		if (net === undefined) {
			net = fn.apply(this, arguments);
			this.nnCache[name] = net;
			Variational.registerParams(name, net.parameters);
			net.setTraining(this.training);
		}
		return net;
	};
};



module.exports = NNArch;




