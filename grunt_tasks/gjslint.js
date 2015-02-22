/*
 * grunt-gjslint
 * https://github.com/jmendiara/grunt-gjslint
 *
 * Copyright (c) 2013 Javier Mendiara Cañardo
 * Licensed under the MIT license.
 */

'use strict';

var gjslint = require('closure-linter-wrapper').gjslint;
var fixjsstyle = require('closure-linter-wrapper').fixjsstyle;

module.exports = function(grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://grunt_tasks.com/creating-tasks

  grunt.registerMultiTask('gjslint', 'Validate files with Google Linter',
    function() {
      var done = this.async();
      var options = this.options({
        force: true,
        reporter: {},
        flags: []
      });

      runTask(this.files, gjslint, options, done);
    }
  );

  grunt.registerMultiTask('fixjsstyle', 'Fix files with Google Linter',
    function() {
      var done = this.async();
      var options = this.options({
        force: true,
        reporter: {},
        flags: []
      });

      runTask(this.files, fixjsstyle, options, done);
    }
  );

  function expandFiles(files) {
    var retArr = [];
    if (files) {
      var allFiles = grunt.file.expand(files)
        .filter(function(filepath) {
          // Warn on and remove invalid source files (if nonull was set).
          if (!grunt.file.exists(filepath)) {
            grunt.log.warn('Source file "' + filepath + '" not found.');
            return false;
          } else {
            return true;
          }
        })
        .map(function(filePath) {
          // Wrap the path between double quotes when whitespaces found.
          return (filePath.indexOf(' ') === -1) ? filePath :
            ['"', filePath, '"'].join('');
        });

      // Currently only for Windows XP or later
      // command line will be too long in Windows
      // http://support.microsoft.com/kb/830473.
      if (process.platform === 'win32') {
        for (var i = 0, lineLen = 0; i < allFiles.length; ++i) {
          lineLen += allFiles[i].length + 1;
          if (lineLen > 7500) {
            retArr.push(allFiles.splice(0, i).join(' '));
            i = -1;
            lineLen = 0;
          }
        }
      }
      if (allFiles.length) {
        retArr.push(allFiles.join(' '));
      }
    }

    return retArr;
  }

  function runTask(files, taskFunc, options, done) {
    // Iterate over all specified file groups.
    files.forEach(function(f) {
      var srcs = expandFiles(f.src);
      var doneCount = 0;
      var isDone = true;

      var doneCheck = function(gjsDone) {
        if (!gjsDone) {
          isDone = false;
        }

        if (++doneCount === srcs.length) {
          done(isDone);
        }
      };

      var callback = function(err, res) {
        var gjsDone = !(err && (err.code !== 1 || options.force));
        doneCheck(gjsDone);
      };

      for (var i = 0, len = srcs.length; i < len; ++i) {
        taskFunc({
          flags: f.additionalFlags ? options.flags.concat(f.additionalFlags) : options.flags,
          reporter: options.reporter,
          src: [srcs[i]]
        }, callback);
        console.log(f.additionalFlags ? options.flags.concat(f.additionalFlags) : options.flags);
      }
    });
  }
};
