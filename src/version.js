var git = require('git-rev-2');

function get(dirname, callback) {
  git.branch(
      dirname,
      function(err, branch) {
        dirname,
        git.short(
            function(err, short) {
              callback({ branch: branch, short: short });
            });
      });
}

module.exports = {
  get: get
};
