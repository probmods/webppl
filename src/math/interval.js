'use strict';

var _ = require('underscore');

function Interval(low, high, lopen, ropen) {
  this.low = low;
  this.high = high;
  this.lopen = lopen;
  this.ropen = ropen;
  this.isBounded = low !== -Infinity || high !== Infinity;
}

Interval.prototype.toString = function() {
  return [
    this.lopen ? '(' : '[',
    this.low,
    ', ',
    this.high,
    this.ropen ? ')' : ']'
  ].join('');
};

function isInterval(val) {
  return val instanceof Interval;
}

// Takes a string representing a real interval and parses it into an
// object.
// e.g. '(0,1]' => {a: 0, b: 1, lopen: true, ropen: false}

function parse(str) {
  var endPoints = str.slice(1, -1).split(',').map(parseFloat);
  if (endPoints.length !== 2 ||
      typeof endPoints[0] !== 'number' || isNaN(endPoints[0]) ||
      typeof endPoints[1] !== 'number' || isNaN(endPoints[1]) ||
      !_.contains(['[', '('], str[0]) ||
      !_.contains([']', ')'], str.slice(-1)[0])) {
    throw new Error('Failed to parse "' + str + '" as an interval.');
  }
  var low = endPoints[0];
  var high = endPoints[1];
  if (low > high) {
    throw new Error('Invalid interval "' + str + '".');
  }
  return new Interval(low, high, str[0] === '(', str.slice(-1)[0] === ')');
}

// Returns a function that checks whether a value is in the given
// interval.
function check(interval) {
  var low = interval.low;
  var high = interval.high;
  var lopen = interval.lopen;
  var ropen = interval.ropen;
  if (!lopen && !ropen) {
    return function(val) {
      return low <= val && val <= high;
    };
  } else if (!lopen && ropen) {
    return function(val) {
      return low <= val && val < high;
    };
  } else if (lopen && !ropen) {
    return function(val) {
      return low < val && val <= high;
    };
  } else if (lopen && ropen) {
    return function(val) {
      return low < val && val < high;
    };
  } else {
    throw new Error('Unreachable');
  }
}

module.exports = {
  isInterval: isInterval,
  parse: parse,
  check: check
};
