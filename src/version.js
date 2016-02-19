var git = require('git-rev-2');

function get(dirname, callback) {
  git.branch(
      dirname,
      function(err, branch) {
        dirname,
        git.describe(
            function(err, describe) {
              callback({ branch: branch, describe: describe });
            });
      });
}

module.exports = {
  get: get
};
