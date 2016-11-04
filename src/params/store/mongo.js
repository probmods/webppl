'use strict';

var _ = require('underscore');
var paramStruct = require('../struct');
var serializeParams = require('../serialize').serializeParams;
var deserializeParams = require('../serialize').deserializeParams;

try {
  // we assume that this is installed globally; it's not in webppl's package.json
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
    throw new Error('No db collection found - make sure to call init first!');
  }
}
function _loadParams(k, id) {
  assertInit();
  _collection.findOne({ _id: id }, {}, function(err, data) {
    if (err) {
      throw new Error('Error getting params from MongoDB: ' + JSON.stringify(err));
    } else {
      if (!data) {
        resume(function() { return k({}); });
      } else {
        if (!data.params) {
          throw new Error('Expected to find `params` property, got ' + JSON.stringify(data));
        }
        return k(deserializeParams(data.params));
      }
    }
  });
}

function _storeParams(k, id, params) {
  assertInit();
  _collection.update({ _id: id }, { params: serializeParams(params) }, { upsert: true }, function(err, result) {
    if (err) {
      throw new Error('Error storing params in MongoDB: ' + JSON.stringify(err));
    } else {
      return k();
    }
  });
}

function init(k) {
  if (!mongodb) {
    throw new Error('MongoDB module not found.');
  }
  console.log('Connecting to MongoDB...');
  var client = mongodb.MongoClient;
  client.connect(mongoURL, function(err, db) {
    if (err) {
      throw new Error('Error connecting to MongoDB: ' + JSON.stringify(err));
    } else {
      console.log('Successfully connected to MongoDB.');
      _collection = db.collection(collectionName);
      resume(function() { return k(); });
    }
  });
}

function getParams(k, id) {
  console.log('Using id', id);
  _loadParams(function(params) {
    resume(function() { return k(params); });
  }, id);
}

function incParams(k, id, params, deltas) {
  _loadParams(function(mongoParams) {
    var newParams;
    if (mongoParams) {
      newParams = mongoParams;
      paramStruct.addEq(newParams, deltas);
    } else {
      newParams = params;
    }
    _storeParams(function() {
      resume(function() { return k(newParams); });
    }, id, newParams);
  }, id);
}

module.exports = {
  init: init,
  getParams: getParams,
  incParams: incParams
};
