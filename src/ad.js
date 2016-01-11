var _ = require('underscore');
var ad = require('ad.js')({ mode: 'r', noHigher: true });

ad.isTape = function(obj) {
  return _.has(obj, 'primal');
};

module.exports = ad;
