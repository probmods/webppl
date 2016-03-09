'use strict';

var execSync = require('child_process').execSync;

function git(cmd) {
  return function(dir) {
    var options = { cwd: dir, stdio: [] };
    return execSync('git ' + cmd, options).toString().trim();
  };
}

function catchAll(fn) {
  return function(arg) {
    try {
      return fn(arg);
    } catch (e) {
      return '';
    }
  };
}

module.exports = {
  short: catchAll(git('rev-parse --short HEAD')),
  branch: catchAll(git('rev-parse --abbrev-ref HEAD'))
};
