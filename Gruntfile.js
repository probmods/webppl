'use strict';

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
    gjslint: {
      options: {
        flags: [
          '--flagfile grunt_tasks/.gjslintrc'
        ],
        reporter: {
          name: 'console'
        },
        force: false
      },
      lib: {
        src: ['src/*.js', 'Gruntfile.js']
      },
      test: {
        src: ['tests/*.js']
      },
      wppl: {
        src: ['examples/*.wppl', 'tests/test-data/*.wppl'],
        additionalFlags: [
          '--disable 10,11', // Disable semicolon errors.
          '--additional_extensions=wppl'
        ]
      }
    },
    fixjsstyle: {
      options: {
        flags: [
          '--flagfile grunt_tasks/.gjslintrc'
        ],
        reporter: {
          name: 'console'
        },
        force: false
      },
      lib: {
        src: ['src/*.js', 'Gruntfile.js']
      },
      test: {
        src: ['tests/*.js']
      }
    }
  });

  grunt.loadTasks('grunt_tasks');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  grunt.registerTask('default', ['nodeunit', 'gjslint']);
  grunt.registerTask('test', ['nodeunit']);
  grunt.registerTask('lint', ['gjslint']);
  grunt.registerTask('jshint', ['jshint']);
  grunt.registerTask('fixstyle', ['fixjsstyle']);
};
