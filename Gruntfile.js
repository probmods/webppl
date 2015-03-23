'use strict';

var jslintSettings = {
  options: {
    flags: [
      '--flagfile .gjslintrc'
    ],
    reporter: {
      name: 'console'
    },
    force: false
  },
  lib: {
    src: ['src/*.js', 'src/analysis/*.js', 'src/transforms/*.js', 'src/inference/*.js', 'Gruntfile.js']
  },
  test: {
    src: ['tests/*.js']
  },
  wppl: {
    src: ['tests/test-data/*.wppl']
  }
};

module.exports = function(grunt) {
  grunt.initConfig({
    nodeunit: {
      all: ['tests/*.js']
    },
    jshint: {
      files: ['Gruntfile.js', 'src/*.js', 'tests/*.js'],
      options: {
        nonew: true,
        curly: true,
        noarg: true,
        trailing: true,
        forin: true,
        noempty: true,
        node: true,
        eqeqeq: true,
        strict: true,
        evil: true,
        undef: true,
        bitwise: true,
        browser: true,
        gcl: true
      }
    },
    gjslint: jslintSettings,
    fixjsstyle: jslintSettings
  });

  grunt.loadNpmTasks('grunt-gjslint');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  grunt.registerTask('default', ['nodeunit', 'gjslint']);
  grunt.registerTask('test', ['nodeunit']);
  grunt.registerTask('lint', ['gjslint']);
  grunt.registerTask('jshint', ['jshint']);
  grunt.registerTask('fixstyle', ['fixjsstyle']);
};
