'use strict';

var jslintSettings = {
  options: {
    flags: ['--flagfile .gjslintrc'],
    reporter: {
      name: 'console'
    },
    force: false
  },
  lib: {
    src: [
      'Gruntfile.js',
      'src/header.wppl',
      'src/**/*.js'
    ]
  },
  test: {
    src: ['tests/**/*.js']
  },
  wppl: {
    src: [
      'tests/test-data/models/*.wppl',
      'examples/*.wppl'
    ]
  }
};
module.exports = function(grunt) {
  grunt.initConfig({
    nodeunit: {
      all: ['tests/*.js']
    },
    jshint: {
      files: [
        'Gruntfile.js',
        'src/header.wppl',
        'src/**/*.js',
        'tests/**/*.js'
      ],
      options: {
        maxerr: 500,
        camelcase: true,
        nonew: true,
        curly: true,
        noarg: true,
        trailing: true,
        forin: true,
        noempty: true,
        node: true,
        eqeqeq: true,
        strict: false,
        evil: true,
        undef: true,
        bitwise: true,
        browser: true,
        gcl: true,
        newcap: false
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
  grunt.registerTask('hint', ['jshint']);
  grunt.registerTask('fixstyle', ['fixjsstyle']);
};
