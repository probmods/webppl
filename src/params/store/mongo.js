'use strict';

var _ = require('underscore');
var paramStruct = require('../struct');
var serializeParams = require('../serialize').serializeParams;
var deserializeParams = require('../serialize').deserializeParams;

try {
  // This is an optional dependence. We don't install it automatically with webppl.
  var mongodb = require('mongodb');
} catch (e) {
  var mongodb = null;
}


var mongoURL = 'mongodb://localhost:27017/webppl';
var collectionName = 'parameters';

var _collection = null;


function resume(thunk) {
  global.trampolineRunner(thunk);
}

function assertInit() {
  if (!_collection) {
    throw new Error('No db collection found - make sure to call "start" first!');
  }
}


// Internal helper functions:

function _loadParams(id, k) {
  assertInit();
  _collection.findOne({ _id: id }, {}, function(err, data) {
    if (err) {
      throw new Error('Failed to load params from MongoDB: ' + JSON.stringify(err));
    } else {
      if (!data) {
        return k({});
      }
      if (!data.params) {
        throw new Error('Expected to find `params` property, got ' +
                        JSON.stringify(data));
      }
      return k(deserializeParams(data.params));
    }
  });
}

function _storeParams(id, params, k) {
  assertInit();
  _collection.update(
      { _id: id },
      { params: serializeParams(params) },
      { upsert: true },
      function(err, result) {
        if (err) {
          throw new Error('Failed to store params in MongoDB: ' + JSON.stringify(err));
        }
        return k();
      });
}


// External interface:

function start(k) {
  if (!mongodb) {
    throw new Error('MongoDB module not found. ' +
                    'Install using `npm install -g mongodb` to use the MongoDB store.');
  }
  console.log('Connecting to MongoDB...');
  var client = mongodb.MongoClient;
  client.connect(mongoURL, function(err, db) {
    if (err) {
      throw new Error('Failed to connect to MongoDB: ' + JSON.stringify(err));
    }
    console.log('Successfully connected to MongoDB.');
    _collection = db.collection(collectionName);
    resume(k);
  });
}

function stop(k) {
  console.log('Disconnecting from MongoDB...');
  _collection.s.db.close(true, function(err, result) {
    if (err) {
      throw new Error('Failed to cleanly close MongoDB connection: ' + JSON.stringify(err));
    }
    console.log('Successfully disconnected from MongoDB.');
    resume(k);
  });
}

function getParams(id, k) {
  console.log('Loading params for id', id);
  _loadParams(id, function(params) {
    resume(function() { return k(params); });
  });
}

function incParams(id, params, deltas, k) {
  _loadParams(id, function(mongoParams) {
    var newParams;
    if (mongoParams) {
      newParams = mongoParams;
      paramStruct.addEq(newParams, deltas);
    } else {
      newParams = params;
    }
    _storeParams(id, newParams, function() {
      resume(function() { return k(newParams); });
    });
  });
}


module.exports = {
  start: start,
  stop: stop,
  getParams: getParams,
  incParams: incParams
};
