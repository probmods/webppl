'use strict';

var _ = require('underscore');
var open = require('open');
var execSync = require('child_process').execSync;

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
      'src/**/!(erp).js'
    ]
  },
  test: {
    src: ['tests/**/*.js']
  },
  wppl: {
    src: [
      'tests/test-data/**/*.wppl',
      'examples/*.wppl'
    ]
  }
};
module.exports = function(grunt) {
  grunt.initConfig({
    nodeunit: {
      all: ['tests/test-*.js']
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
    fixjsstyle: jslintSettings,
    clean: ['compiled/*.js']
  });

  grunt.loadNpmTasks('grunt-gjslint');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-clean');

  grunt.registerTask('default', ['gjslint', 'nodeunit']);
  grunt.registerTask('test', ['nodeunit']);
  grunt.registerTask('lint', ['gjslint']);
  grunt.registerTask('hint', ['jshint']);
  grunt.registerTask('fixstyle', ['fixjsstyle']);
  grunt.registerTask('travis-phantomjs', ['compile', 'test-phantomjs']);

  grunt.registerTask('compile', 'Compile for the browser', function() {
    var pkgArg = '';
    if (arguments.length > 0) {
      var requires = _.chain(_.toArray(arguments))
          .map(function(name) { return ['--require', '\"' + name + '\"']; })
          .flatten().value();
      pkgArg = ' -t [' + ['./src/bundle.js'].concat(requires).join(' ') + ']';
    }
    execSync('mkdir -p compiled');
    grunt.log.writeln('Running browserify');
    execSync('browserify' + pkgArg + ' -g brfs src/browser.js > compiled/webppl.js');
    grunt.log.writeln('Running uglifyjs');
    execSync('uglifyjs compiled/webppl.js -b ascii_only=true,beautify=false > compiled/webppl.min.js');
  });

  grunt.registerTask('test-browser', function() {
    open('tests/browser/index.html', process.env.BROWSER);
  });

  grunt.registerTask('test-phantomjs', function() {
    try {
      var output = execSync('phantomjs node_modules/qunit-phantomjs-runner/runner-list.js tests/browser/index.html');
      grunt.log.writeln(output);
    } catch (e) {
      grunt.log.writeln(e.output.join('\n'));
      throw e;
    }
  });
};
