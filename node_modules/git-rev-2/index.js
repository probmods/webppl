var exec = require('child_process').exec

function _command (cmd, dir, cb) {
  if (typeof dir === 'function') cb = dir, dir = __dirname
  exec(cmd, { cwd: dir }, function (err, stdout, stderr) {
    if (err) {
      return cb(err)
    }
    cb(null, stdout.split('\n').join(''))
  })
}

module.exports = {
    short : _command.bind(null, 'git rev-parse --short HEAD')
  , long : _command.bind(null, 'git rev-parse HEAD')
  , branch : _command.bind(null, 'git rev-parse --abbrev-ref HEAD')
  , tag : _command.bind(null, 'git describe --always --tag --abbrev=0')
  , log : function (dir, cb) {
      if (typeof dir === 'function') cb = dir, dir = __dirname
      _command('git log --no-color --pretty=format:\'[ "%H", "%s", "%cr", "%an" ],\' --abbrev-commit', dir, function (err, str) {
        if (err) return cb(err)
        str = str.substr(0, str.length-1)
        cb(null, JSON.parse('[' + str + ']'))
      })
    }
}
