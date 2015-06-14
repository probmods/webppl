
// Inference query table
// Simple abstraction over js objects that provides a
//   write-only interface

function Query() {
  this.table = {};
}

Query.prototype.add = function(key, val) {
  this.table[key] = val;
};

Query.prototype.addAll = function(other) {
  for (var key in other.table)
    this.table[key] = other.table[key];
};

Query.prototype.clear = function() {
  this.table = {};
};

// Returns a copy
Query.prototype.getTable = function() {
  var tbl = {};
  for (var key in this.table)
    tbl[key] = this.table[key];
  return tbl;
};


module.exports = {
  Query: Query
};
