'use strict';

var base = require('./base');

var ImproperUniform = base.makeDistributionType({
  name: 'ImproperUniform',
  desc: 'Improper continuous uniform distribution which has probability one everywhere.',
  params: [],
  nodoc: true,
  nohelper: true,
  mixins: [base.continuousSupport],
  sample: function() {
    throw new Error('cannot sample from this improper distribution.');
  },
  score: function(val) {
    return 0;
  }
});

module.exports = {
  ImproperUniform: ImproperUniform
};
