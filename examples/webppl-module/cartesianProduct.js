var _ = require('underscore');

var cartesianProductOf = function(listOfLists) {
    return _.reduce(listOfLists, function(a, b) {
        return _.flatten(_.map(a, function(x) {
            return _.map(b, function(y) {
                return x.concat([y]);
            });
        }), true);
    }, [ [] ]);
};

// Sometimes you just need all possible combination of true and false
var TFCartesianProd = function(n) {
  var result = [];
  _.map(_.range(n), function(i){
      result.push(['true', 'false']);
  });
  return cartesianProductOf(result);
};

module.exports = {
    TFCartesianProd : TFCartesianProd
};
