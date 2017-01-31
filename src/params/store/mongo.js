'use strict';

var _ = require('lodash');
var paramStruct = require('../struct');
var tensorsToObjects = require('../serialize').tensorsToObjects;
var objectsToTensors = require('../serialize').objectsToTensors;

try {
  // This is an optional dependence. We don't install it automatically with webppl.
  var mongodb = require('mongodb');
} catch (e) {
  var mongodb = null;
}


var mongoURL = process.env.WEBPPL_MONGO_URL || 'mongodb://localhost:27017/webppl';
var collectionName = process.env.WEBPPL_MONGO_COLLECTION || 'parameters';

var _collection = null;


function resume(thunk) {
  global.resumeTrampoline(thunk);
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
      return k(objectsToTensors(data.params));
    }
  });
}

function _storeParams(id, params, k) {
  assertInit();
  _collection.update(
      { _id: id },
      { params: tensorsToObjects(params) },
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
    throw new Error('MongoDB module not found. Run `npm install mongodb` ' +
                    'in the webppl directory to use the MongoDB store.');
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
  _loadParams(id, function(params) {
    resume(function() { return k(params); });
  });
}

function setParams(id, params, k) {
  _storeParams(id, params, function() {
    resume(function() { return k(); });
  });
}


module.exports = {
  start: start,
  stop: stop,
  getParams: getParams,
  setParams: setParams
};
